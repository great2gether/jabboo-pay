// Glue between parser and PayPal client, shared by CLI, web UI and MCP server.
// Logs only event names and PayPal ids: never the spoken text, names, e-mails or amounts.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCommand, parseControl, describe, SUPPORTED_CURRENCIES } from "./parser.js";
import { createPayPalClient } from "./paypal.js";
import { parseQuery, answerQuery, confirmationPrompt } from "./query.js";
import { createLedger } from "./ledger.js";
import { randomUUID } from "node:crypto";
import { createAudit, parseAuditQuery, auditSpeech, verifySpeech } from "./audit.js";
import { parseDueQuery, dueSpeech } from "./calendar.js";
import { parseGridQuery, parseGridNav, toFilterModel, applyFilters, summarize } from "./grid.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv(root = ROOT) {
  const file = join(root, ".env");
  if (existsSync(file) && typeof process.loadEnvFile === "function") process.loadEnvFile(file);
}

export function loadContacts(root = ROOT, env = process.env) {
  const file = env.JABBOO_PAY_CONTACTS || [join(root, "contacts.json"), join(root, "contacts.example.json")].find(existsSync);
  if (!file || !existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8"));
}

export function log(event, fields = {}) {
  const safe = {};
  for (const k of ["id", "kind", "status", "paid", "debugId", "code"]) if (fields[k] !== undefined) safe[k] = fields[k];
  process.stderr.write(`[jabboo-pay] ${event} ${JSON.stringify(safe)}\n`);
}

// Normalise structured input (from MCP or the UI) into the parser's command shape.
export function commandFromFields(f, { defaultCurrency = "EUR" } = {}) {
  const currency = String(f.currency || defaultCurrency).toUpperCase();
  const quantity = Number(f.quantity || 1);
  const unitAmount = Number(f.unit_amount ?? f.unitAmount ?? (f.amount != null ? Number(f.amount) / quantity : NaN));
  const errors = [];
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) errors.push("amount must be a positive number");
  if (!Number.isInteger(quantity) || quantity < 1) errors.push("quantity must be a positive integer");
  if (!SUPPORTED_CURRENCIES.includes(currency)) errors.push(`currency must be one of ${SUPPORTED_CURRENCIES.join(", ")}`);
  const kind = f.kind === "payment_link" ? "payment_link" : "invoice";
  const email = f.recipient_email || f.recipient?.email || null;
  if (kind === "invoice" && !email) errors.push("recipient_email is required for an invoice");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("recipient_email is not a valid e-mail address");
  const description = String(f.description || "").trim() || "Services";
  if (errors.length) {
    const e = new Error(errors.join("; "));
    e.code = "invalid_input";
    throw e;
  }
  return {
    ok: true,
    kind,
    recipient: email || f.recipient_name ? { name: f.recipient_name || f.recipient?.name || email.split("@")[0], email } : null,
    amount: (unitAmount * quantity).toFixed(2),
    unitAmount: unitAmount.toFixed(2),
    quantity,
    unit: f.unit === "HOURS" ? "HOURS" : "QUANTITY",
    currency,
    description: description.slice(0, 120),
    dueInDays: f.due_in_days ? Number(f.due_in_days) : f.dueInDays || null,
    language: f.language || "en",
    missing: [],
  };
}

export function createService({ env = process.env, root = ROOT, client = null, contacts = null, ledger = null, audit = null } = {}) {
  const defaultCurrency = env.DEFAULT_CURRENCY || "EUR";
  const book = contacts || loadContacts(root, env);
  const store = ledger || createLedger(env.JABBOO_PAY_LEDGER || join(root, "data", "ledger.json"));
  const trail = audit || createAudit(env.JABBOO_PAY_AUDIT_FILE || join(root, "data", "audit.jsonl"), { enabled: env.JABBOO_PAY_AUDIT !== "0" });
  let paypal = client;
  const getClient = () =>
    (paypal ||= createPayPalClient({ clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET }));

  async function refresh(rows) {
    const api = getClient();
    return Promise.all(
      rows.map(async (r) => {
        if (r.paid) return r;
        try {
          const s = r.kind === "invoice" ? await api.getInvoice(r.id) : await api.getOrder(r.id);
          store.update(r.id, { status: s.status, paid: s.paid });
          return { ...r, status: s.status, paid: s.paid };
        } catch {
          return r;
        }
      }),
    );
  }

  let gridCache = null;
  const service = {
    contacts: book,
    ledger: store,
    audit: trail,

    cancel(flowId, by = "voice") {
      if (flowId) trail.append("cancelled", { flow: flowId, by });
    },
    configured: () => Boolean(client || (env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)),

    parse(text) {
      const cmd = parseCommand(text, book, { defaultCurrency });
      return { ...cmd, summary: describe(cmd) };
    },

    async create(cmd, { returnUrl, cancelUrl, flowId, confirmedBy = "voice", source } = {}) {
      if (!cmd?.ok) {
        const e = new Error(`Command incomplete: missing ${(cmd?.missing || ["everything"]).join(", ")}`);
        e.code = "incomplete";
        throw e;
      }
      const flow = flowId || randomUUID();
      if (!flowId) trail.append("heard", { flow, source: source || confirmedBy, text: null, summary: describe(cmd) });
      trail.append("confirmed", { flow, by: confirmedBy, summary: describe(cmd) });
      const api = getClient();
      const endpoint = cmd.kind === "invoice" ? "POST /v2/invoicing/invoices + /send" : "POST /v2/checkout/orders";
      let result;
      try {
        result =
          cmd.kind === "invoice"
            ? await api.createInvoice(cmd, { invoicerName: env.INVOICER_NAME })
            : await api.createOrder(cmd, { returnUrl, cancelUrl });
      } catch (err) {
        trail.append("paypal", { flow, endpoint, result: "error", code: err.paypalName || err.code || err.status || "error", debugId: err.debugId });
        throw err;
      }
      trail.append("paypal", { flow, endpoint, result: "ok", kind: result.kind, id: result.id, status: result.status });
      log("created", result);
      const dueDate = cmd.dueInDays ? new Date(Date.now() + cmd.dueInDays * 86_400_000).toISOString().slice(0, 10) : null;
      store.add({
        dueDate,
        id: result.id,
        kind: result.kind,
        status: result.status,
        paid: false,
        link: result.link,
        name: cmd.recipient?.name || null,
        amount: cmd.amount,
        currency: cmd.currency,
        description: cmd.description,
        language: cmd.language,
      });
      return { ...result, summary: describe(cmd) };
    },

    async status(kind, id) {
      const api = getClient();
      const s = kind === "invoice" ? await api.getInvoice(id) : await api.getOrder(id);
      store.update(s.id || id, { status: s.status, paid: s.paid });
      log("status", s);
      return s;
    },

    // Answer "has Max paid?" / "what is still open?" with fresh PayPal status.
    async answer(query) {
      const rows = store.list();
      const relevant = query.type === "open" ? rows.filter((r) => !r.paid).slice(0, 20) : rows.slice(0, 20);
      const fresh = await refresh(relevant);
      const byId = new Map(fresh.map((r) => [r.id, r]));
      const all = rows.map((r) => byId.get(r.id) || r);
      return { type: "answer", query, speech: answerQuery(query, all) };
    },

    // All rows for the grid: our ledger (fresh status) + PayPal invoice list + Transaction Search.
    // A source the Sandbox app is not allowed to read is skipped with a note.
    async gridRows({ maxAgeMs = 0 } = {}) {
      if (gridCache && Date.now() - gridCache.at < maxAgeMs) return gridCache.value;
      const notes = [];
      const api = getClient();
      const ledgerRows = (await refresh(store.list().slice(0, 50))).map((r) => ({
        id: r.id,
        kind: r.kind,
        recipient: r.name,
        email: null,
        amount: Number(r.amount),
        currency: r.currency,
        description: r.description,
        status: r.status,
        statusText: r.paid ? "Paid" : ["CANCELLED", "VOIDED"].includes(r.status) ? "Cancelled" : "Open",
        paid: !!r.paid,
        date: r.createdAt,
        due: r.dueDate || (r.createdAt || "").slice(0, 10) || null,
        link: r.link,
      }));
      const byId = new Map(ledgerRows.map((r) => [r.id, r]));
      const sources = [
        ["invoices", () => api.listInvoices(), "Invoicing"],
        ["transactions", () => api.listTransactions(), "Transaction search"],
      ];
      for (const [name, load, feature] of sources) {
        try {
          for (const r of await load()) {
            if (!r.id) continue;
            const mine = byId.get(r.id);
            if (!mine) byId.set(r.id, r);
            else if (r.due) mine.due = r.due; // PayPal knows the real due date
          }
        } catch (err) {
          notes.push(err.status === 403 || err.paypalName === "NOT_AUTHORIZED" || /NOT_AUTHORIZED|PERMISSION/.test(err.message)
            ? `PayPal ${name} not available: enable “${feature}” in the Sandbox app’s features.`
            : `PayPal ${name} could not be loaded right now.`);
        }
      }
      const rows = [...byId.values()].map((r) => ({ ...r, kindText: { invoice: "Invoice", payment_link: "Payment link", transaction: "Transaction" }[r.kind] }));
      rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      gridCache = { at: Date.now(), value: { rows, notes } };
      return { rows, notes };
    },

    async gridSearch(query) {
      const { rows, notes } = await service.gridRows({ maxAgeMs: 5000 });
      const hits = query.reset ? rows : applyFilters(rows, query.filters);
      const speech = query.reset
        ? (query.language === "de" ? `Alle Filter aus. ${rows.length} Einträge.` : `All filters cleared. ${rows.length} entries.`)
        : summarize(hits, query.filters, query.language);
      return { type: "grid", query, filterModel: query.reset ? {} : toFilterModel(query.filters), count: hits.length, speech, notes, rows };
    },

    // One entry point for whatever was said: a reply, a question or a new command.
    async interpret(text, { source = "keyboard" } = {}) {
      const control = parseControl(text || "");
      if (control) return { type: "control", control };
      const aq = parseAuditQuery(text || "");
      if (aq) {
        const speech = aq.action === "verify"
          ? verifySpeech(trail.verify(), aq.language)
          : auditSpeech(trail.entries(), { today: aq.today, language: aq.language });
        return { type: "audit", query: aq, speech, verify: trail.verify() };
      }
      const dq = parseDueQuery(text || "");
      if (dq) {
        const { rows } = await service.gridRows({ maxAgeMs: 5000 });
        const { speech, items } = dueSpeech(rows, dq);
        return { type: "calendar", query: dq, speech, items, rows };
      }
      const nav = parseGridNav(text || "");
      if (nav) return { type: "grid_nav", move: nav };
      const gq = parseGridQuery(text || "", book);
      if (gq) return service.gridSearch(gq);
      const query = parseQuery(text || "", book);
      if (query) return service.answer(query);
      const cmd = service.parse(String(text || ""));
      const speech = confirmationPrompt(cmd);
      const flowId = randomUUID();
      trail.append("heard", { flow: flowId, source, text: String(text || "").slice(0, 500), summary: cmd.ok ? describe(cmd) : null });
      trail.append("asked", { flow: flowId, speech, complete: cmd.ok });
      return { type: "command", command: cmd, speech, flowId };
    },
  };
  return service;
}
