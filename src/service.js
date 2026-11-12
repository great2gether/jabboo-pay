// Glue between parser and PayPal client, shared by CLI, web UI and MCP server.
// Logs only event names and PayPal ids: never the spoken text, names, e-mails or amounts.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCommand, describe, SUPPORTED_CURRENCIES } from "./parser.js";
import { createPayPalClient } from "./paypal.js";

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

export function createService({ env = process.env, root = ROOT, client = null, contacts = null } = {}) {
  const defaultCurrency = env.DEFAULT_CURRENCY || "EUR";
  const book = contacts || loadContacts(root, env);
  let paypal = client;
  const getClient = () =>
    (paypal ||= createPayPalClient({ clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET }));

  return {
    contacts: book,
    configured: () => Boolean(client || (env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)),

    parse(text) {
      const cmd = parseCommand(text, book, { defaultCurrency });
      return { ...cmd, summary: describe(cmd) };
    },

    async create(cmd, { returnUrl, cancelUrl } = {}) {
      if (!cmd?.ok) {
        const e = new Error(`Command incomplete: missing ${(cmd?.missing || ["everything"]).join(", ")}`);
        e.code = "incomplete";
        throw e;
      }
      const api = getClient();
      const result =
        cmd.kind === "invoice"
          ? await api.createInvoice(cmd, { invoicerName: env.INVOICER_NAME })
          : await api.createOrder(cmd, { returnUrl, cancelUrl });
      log("created", result);
      return { ...result, summary: describe(cmd) };
    },

    async status(kind, id) {
      const api = getClient();
      const s = kind === "invoice" ? await api.getInvoice(id) : await api.getOrder(id);
      log("status", s);
      return s;
    },
  };
}
