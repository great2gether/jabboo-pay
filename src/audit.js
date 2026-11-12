// Tamper-evident audit log for assisted payments.
// Every step (what was heard, what was read back, who confirmed how, what PayPal answered)
// is one JSON line in data/audit.jsonl. Each line carries the SHA-256 of the previous line,
// so changing or deleting any line breaks the chain from that line on.
// Local only, no audio, no secrets. Off with JABBOO_PAY_AUDIT=0.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { spokenMoney } from "./query.js";

export const GENESIS = "0".repeat(64);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// Stable JSON (sorted keys) so the hash does not depend on key order.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashEntry(entry) {
  const { hash, ...rest } = entry;
  return sha256(canonical(rest));
}

export function verifyEntries(entries) {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || e.prev !== prev || e.seq !== i + 1 || hashEntry(e) !== e.hash) return { ok: false, count: entries.length, brokenAt: i + 1 };
    prev = e.hash;
  }
  return { ok: true, count: entries.length, brokenAt: null, head: prev };
}

export function createAudit(file, { enabled = true, now = () => new Date() } = {}) {
  let memory = [];
  const read = () => {
    if (!file) return memory;
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      });
  };
  return {
    enabled,
    file,
    append(event, fields = {}) {
      if (!enabled) return null;
      const entries = read();
      const last = entries[entries.length - 1];
      const entry = { seq: entries.length + 1, time: now().toISOString(), event, ...fields, prev: last?.hash || GENESIS };
      entry.hash = hashEntry(entry);
      if (file) {
        mkdirSync(dirname(file), { recursive: true });
        appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 0o600 });
      } else memory.push(entry);
      return entry;
    },
    entries: read,
    verify: () => verifyEntries(read()),
  };
}

// --- spoken summaries ---------------------------------------------------------

const BY = {
  de: { voice: "per Stimme", keyboard: "per Taste", button: "per Knopf", cli: "im Terminal", mcp: "über die MCP-Freigabe" },
  en: { voice: "by voice", keyboard: "by key", button: "by button", cli: "in the terminal", mcp: "via MCP approval" },
};

export function parseAuditQuery(input) {
  const t = String(input || "").toLowerCase().replace(/[^\p{L}\s']/gu, " ").replace(/\s+/g, " ").trim().replace(/\s*(?:jabboo|jabu|absenden)$/, "");
  const de = /\b(protokoll|prüf|prüfe|lies|heute|kette)\b/.test(t);
  if (/\b(prüf|prüfe|überprüfe|verify|check)\b.*\b(protokoll|kette|audit|log|chain)\b/.test(t)) return { type: "audit", action: "verify", language: de ? "de" : "en" };
  if (/\b(protokoll|audit log|audit trail|audit)\b/.test(t)) return { type: "audit", action: "read", today: /\b(heute|today|von heute|today's)\b/.test(t), language: de ? "de" : "en" };
  return null;
}

export function verifySpeech(result, language = "en") {
  const de = language === "de";
  if (result.count === 0) return de ? "Das Protokoll ist noch leer." : "The audit log is still empty.";
  if (result.ok) return de ? `Das Protokoll ist unverändert. ${result.count} Einträge, Kette geprüft.` : `The audit log is unchanged. ${result.count} entries, chain verified.`;
  return de ? `Achtung: Das Protokoll wurde verändert, ab Zeile ${result.brokenAt}.` : `Warning: the audit log was changed, starting at line ${result.brokenAt}.`;
}

// Group the steps of one command (same flow id) into one spoken sentence.
export function auditSpeech(entries, { today = false, language = "en", now = new Date() } = {}) {
  const de = language === "de";
  const day = now.toISOString().slice(0, 10);
  const list = today ? entries.filter((e) => e.time.slice(0, 10) === day) : entries;
  const flows = new Map();
  for (const e of list) {
    if (!e.flow) continue;
    if (!flows.has(e.flow)) flows.set(e.flow, []);
    flows.get(e.flow).push(e);
  }
  if (flows.size === 0) return de ? `${today ? "Heute" : "Bisher"} gibt es keine Einträge.` : `There are no entries${today ? " today" : ""}.`;
  const parts = [];
  for (const steps of [...flows.values()].slice(-8)) {
    const heard = steps.find((s) => s.event === "heard");
    const conf = steps.find((s) => s.event === "confirmed" || s.event === "cancelled");
    const pp = steps.find((s) => s.event === "paypal");
    const time = new Date(steps[0].time).toLocaleTimeString(de ? "de-DE" : "en-US", { hour: "2-digit", minute: "2-digit" });
    const what = (heard?.summary || heard?.text || (de ? "ein Befehl" : "a command")).replace(/(\d+(?:\.\d+)?) (EUR|USD|GBP|CHF)\b/g, (_, a, c) => spokenMoney(a, c, language));
    let outcome;
    if (conf?.event === "cancelled") outcome = de ? `abgebrochen ${BY.de[conf.by] || ""}` : `cancelled ${BY.en[conf.by] || ""}`;
    else if (conf && pp?.result === "ok") outcome = de ? `bestätigt ${BY.de[conf.by] || ""}, bei PayPal erstellt` : `confirmed ${BY.en[conf.by] || ""}, created at PayPal`;
    else if (conf && pp) outcome = de ? `bestätigt, aber PayPal meldete einen Fehler` : `confirmed, but PayPal returned an error`;
    else outcome = de ? "noch nicht bestätigt" : "not confirmed";
    parts.push(`${time}: ${what}, ${outcome.trim()}`);
  }
  const n = flows.size;
  const head = de ? `${today ? "Heute" : "Insgesamt"} ${n === 1 ? "ein Vorgang" : `${n} Vorgänge`}` : `${n === 1 ? "One action" : `${n} actions`}${today ? " today" : ""}`;
  return `${head}. ${parts.join(". ")}.`;
}
