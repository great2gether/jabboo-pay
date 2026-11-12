// "Was wird diese Woche fällig?" -> open invoices and links due in that range, as a sentence. Pure.

import { stripWakeAndSend } from "./parser.js";
import { dateRange } from "./grid.js";
import { spokenMoney } from "./query.js";

const DUE = /(?<![\p{L}])(fällig\p{L}*|überfällig\p{L}*|due|overdue|zahlungsziel\p{L}*|deadline\p{L}*)(?![\p{L}])/iu;

export function parseDueQuery(input, { now = new Date() } = {}) {
  const text = stripWakeAndSend(input).replace(/[?!.]+$/g, "").trim();
  if (!text || !DUE.test(text)) return null;
  if (/\b(schick|sende|stell|erstell|send|create|make|bill|invoice\s+\p{Lu})/iu.test(text) && /\d/.test(text)) return null; // a new invoice with a due date
  const language = /\b(was|wird|werden|ist|sind|fällig|diese|woche|heute|morgen|nächste|monat|welche)\b/i.test(text) ? "de" : "en";
  const range = dateRange(text, now) || dateRange("diese woche", now);
  const day = (d) => d.toISOString().slice(0, 10);
  return { type: "due", language, from: day(range[0]), to: day(range[1]), overdue: /(?<![\p{L}])(überfällig\p{L}*|overdue)(?![\p{L}])/iu.test(text) };
}

const WEEKDAYS = {
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

export function dueItems(rows, q, { today = new Date().toISOString().slice(0, 10) } = {}) {
  return rows
    .filter((r) => r.due && r.statusText === "Open" && r.kind !== "transaction")
    .filter((r) => (q.overdue ? r.due < today : r.due >= q.from && r.due <= q.to))
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function dueSpeech(rows, q, opts = {}) {
  const lang = q.language === "de" ? "de" : "en";
  const items = dueItems(rows, q, opts);
  const when = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return lang === "de" ? `${WEEKDAYS.de[d.getUTCDay()]}, ${d.getUTCDate()}.${d.getUTCMonth() + 1}.` : `${WEEKDAYS.en[d.getUTCDay()]}, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  };
  if (items.length === 0) {
    return { items, speech: lang === "de" ? (q.overdue ? "Nichts ist überfällig." : "In diesem Zeitraum wird nichts fällig.") : q.overdue ? "Nothing is overdue." : "Nothing is due in that period." };
  }
  const totals = {};
  for (const r of items) totals[r.currency] = (totals[r.currency] || 0) + Number(r.amount);
  const sum = Object.entries(totals).map(([c, v]) => spokenMoney(v.toFixed(2), c, lang)).join(lang === "de" ? " und " : " and ");
  const list = items
    .slice(0, 6)
    .map((r) => `${r.recipient ? r.recipient.split(/\s+/)[0] : lang === "de" ? "Zahlungslink" : "payment link"} ${spokenMoney(Number(r.amount).toFixed(2), r.currency, lang)} ${lang === "de" ? "am" : "on"} ${when(r.due)}`)
    .join(", ");
  const n = items.length;
  const head = lang === "de"
    ? `${q.overdue ? "Überfällig" : "Fällig"}: ${n === 1 ? "eine Zahlung" : `${n} Zahlungen`}`
    : `${q.overdue ? "Overdue" : "Due"}: ${n === 1 ? "one payment" : `${n} payments`}`;
  return { items, speech: `${head}. ${list}. ${lang === "de" ? "Zusammen" : "Total"} ${sum}.` };
}
