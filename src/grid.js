// Voice search over all PayPal data, as an AG Grid filter model plus a spoken summary. Pure.
//   "Zeig mir alle offenen Rechnungen über 100 Euro aus diesem Monat"
//     -> filters { status: "open", kind: "invoice", minAmount: 100, currency: "EUR", dateFrom, dateTo }
//     -> filterModel for AG Grid, and "3 offene Rechnungen, zusammen 420 Euro, älteste an Max vom 3.11."

import { stripWakeAndSend, findContact, findAmounts } from "./parser.js";
import { wordsToDigits } from "./numbers.js";
import { spokenMoney } from "./query.js";

const TRIGGER = /^(?:bitte\s+)?(?:zeig|zeige|zeigt|show|such|suche|search|find|finde|filter|filtere|liste|list|welche|which|alle|all|nur|only|gib mir|give me)\b/i;
const RESET = /^(?:zeig|zeige|show|liste|list)\s+(?:mir\s+|me\s+)?(?:wieder\s+)?(?:alles|alle zahlungen|everything|all payments|all)\s*$|^(?:filter|filters?)\s+(?:zurücksetzen|löschen|aus|weg|reset|clear|off)$|^(?:alle filter|clear (?:all )?filters)/i;

const MONTHS = {
  januar: 0, january: 0, jan: 0, februar: 1, february: 1, feb: 1, märz: 2, maerz: 2, march: 2, april: 3,
  mai: 4, may: 4, juni: 5, june: 5, juli: 6, july: 6, august: 7, september: 8, oktober: 9, october: 9,
  november: 10, dezember: 11, december: 11,
};

const day = (d) => d.toISOString().slice(0, 10);
const startOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function dateRange(text, now) {
  const today = startOfDay(now);
  const t = text.toLowerCase();
  const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
  if (/\b(heute|today)\b/.test(t)) return [today, today];
  if (/\b(gestern|yesterday)\b/.test(t)) return [addDays(today, -1), addDays(today, -1)];
  if (/\b(diese[nmr]?\s+woche|this week)\b/.test(t)) {
    const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
    return [addDays(today, -dow), addDays(today, 6 - dow)];
  }
  if (/\b(nächste[nmr]?\s+woche|kommende[nmr]?\s+woche|next week)\b/.test(t)) {
    const dow = (today.getUTCDay() + 6) % 7;
    return [addDays(today, 7 - dow), addDays(today, 13 - dow)];
  }
  if (/\b(morgen|tomorrow)\b/.test(t)) return [addDays(today, 1), addDays(today, 1)];
  if (/\b(nächste[nmr]?\s+monat|next month)\b/.test(t)) return [new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)), new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0))];
  if (/\b(letzte[nmr]?\s+woche|last week)\b/.test(t)) {
    const dow = (today.getUTCDay() + 6) % 7;
    return [addDays(today, -dow - 7), addDays(today, -dow - 1)];
  }
  const lastN = t.match(/\b(?:letzten|last|past|vergangenen)\s+(\d{1,3})\s+(tage|tagen|days)\b/);
  if (lastN) return [addDays(today, -Number(lastN[1]) + 1), today];
  const month = (y, m) => [new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 0))];
  if (/\b(diese[nmr]?\s+monat|this month)\b/.test(t)) return month(today.getUTCFullYear(), today.getUTCMonth());
  if (/\b(letzte[nmr]?\s+monat|vormonat|last month)\b/.test(t)) return month(today.getUTCFullYear(), today.getUTCMonth() - 1);
  if (/\b(dieses jahr|this year)\b/.test(t)) return [new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), new Date(Date.UTC(today.getUTCFullYear(), 11, 31))];
  const named = t.match(/\b(?:im|in|aus dem|from|of|vom)\s+(januar|january|februar|february|märz|maerz|march|april|mai|may|juni|june|juli|july|august|september|oktober|october|november|dezember|december)\b/);
  if (named) {
    const m = MONTHS[named[1]];
    const y = m > today.getUTCMonth() ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
    return month(y, m);
  }
  return null;
}

export function parseGridQuery(input, contacts = {}, { now = new Date() } = {}) {
  const original = stripWakeAndSend(input).replace(/[?!.]+$/g, "").trim();
  if (!original || !TRIGGER.test(original)) return null;
  const text = wordsToDigits(original);
  const language = /\b(zeig|zeige|such|suche|finde|liste|welche|alle|rechnung|rechnungen|offen|offenen|bezahlt|über|unter|diese|diesem|letzten|mir)\b/i.test(original) ? "de" : "en";
  if (RESET.test(original)) return { type: "grid", reset: true, filters: {}, language };

  const f = {};
  const t = text.toLowerCase();
  if (/\b(unbezahlt\w*|offen\w*|ausstehend\w*|unpaid|open|outstanding|pending|due)\b/.test(t)) f.status = "open";
  else if (/\b(bezahlt\w*|beglichen\w*|paid|settled|completed)\b/.test(t)) f.status = "paid";
  else if (/\b(storniert\w*|cancel+ed|voided)\b/.test(t)) f.status = "cancelled";

  if (/\b(rechnung|rechnungen|invoice|invoices)\b/.test(t)) f.kind = "invoice";
  else if (/\b(zahlungslinks?|links?|payment links?|orders?|bestellungen)\b/.test(t)) f.kind = "payment_link";
  else if (/\b(transaktion|transaktionen|transactions?|zahlungseingänge|eingänge)\b/.test(t)) f.kind = "transaction";

  // Amounts: "über 100 Euro", "unter 50", "zwischen 20 und 80 Euro", "more than $100".
  const between = t.match(/\b(?:zwischen|between)\s+([\d.,]+)\s*(?:\S+\s+)?(?:und|and)\s+([\d.,]+)/);
  const num = (s) => Number(String(s).replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (between) {
    f.minAmount = num(between[1]);
    f.maxAmount = num(between[2]);
  } else {
    const min = t.match(/(?<![\p{L}])(?:über|ueber|mehr als|ab|größer als|grösser als|mindestens|over|above|more than|at least|greater than)\s+[€$£]?\s?([\d.,]+)/u);
    const max = t.match(/(?<![\p{L}])(?:unter|weniger als|bis|höchstens|kleiner als|under|below|less than|up to|at most)\s+[€$£]?\s?([\d.,]+)/u);
    if (min) f.minAmount = num(min[1]);
    if (max) f.maxAmount = num(max[1]);
  }
  const cur = findAmounts(text).find((a) => a.currency);
  if (cur && (f.minAmount != null || f.maxAmount != null)) f.currency = cur.currency;
  else if (/\b(dollar|dollars|usd)\b/.test(t)) f.currency = "USD";
  else if (/\b(pfund|pounds?|gbp)\b/.test(t)) f.currency = "GBP";

  const range = dateRange(text, now);
  if (range) {
    f.dateFrom = day(range[0]);
    f.dateTo = day(range[1]);
  }

  for (const w of original.match(/\p{Lu}[\p{L}'-]+/gu) || []) {
    const c = findContact(w, contacts);
    if (c && !/^(Zeig|Zeige|Show|Rechnungen|Rechnung|Alle|All|Liste|List|Such|Suche)$/i.test(w)) {
      f.name = (c.name || c.key).split(/\s+/)[0];
      break;
    }
  }
  if (!f.name) {
    const m = original.match(/(?<![\p{L}])(?:an|von|für|to|from|for)\s+(\p{Lu}[\p{L}'-]+)/u);
    if (m && !MONTHS[m[1].toLowerCase()] && !/^(Euro|Dollar|Dollars|Diesen|Diesem|Letzten|This|Last)$/.test(m[1])) f.name = m[1];
  }
  return { type: "grid", reset: false, filters: f, language };
}

// Filter model for AG Grid columns: statusText, kindText, amount, currency, date, recipient.
export function toFilterModel(filters = {}) {
  const m = {};
  if (filters.status) m.statusText = { filterType: "text", type: "equals", filter: { open: "Open", paid: "Paid", cancelled: "Cancelled" }[filters.status] };
  if (filters.kind) m.kindText = { filterType: "text", type: "equals", filter: { invoice: "Invoice", payment_link: "Payment link", transaction: "Transaction" }[filters.kind] };
  if (filters.minAmount != null && filters.maxAmount != null) m.amount = { filterType: "number", type: "inRange", filter: filters.minAmount, filterTo: filters.maxAmount };
  else if (filters.minAmount != null) m.amount = { filterType: "number", type: "greaterThan", filter: filters.minAmount };
  else if (filters.maxAmount != null) m.amount = { filterType: "number", type: "lessThan", filter: filters.maxAmount };
  if (filters.currency) m.currency = { filterType: "text", type: "equals", filter: filters.currency };
  if (filters.dateFrom) m.date = { filterType: "date", type: "inRange", dateFrom: `${filters.dateFrom} 00:00:00`, dateTo: `${filters.dateTo} 00:00:00` };
  if (filters.name) m.recipient = { filterType: "text", type: "contains", filter: filters.name };
  return m;
}

// The same filter on the server, for the spoken summary (and for CLI / MCP).
export function applyFilters(rows, filters = {}) {
  return rows.filter((r) => {
    if (filters.status === "open" && r.statusText !== "Open") return false;
    if (filters.status === "paid" && r.statusText !== "Paid") return false;
    if (filters.status === "cancelled" && r.statusText !== "Cancelled") return false;
    if (filters.kind && r.kind !== filters.kind) return false;
    if (filters.minAmount != null && !(r.amount > filters.minAmount)) return false;
    if (filters.maxAmount != null && !(r.amount < filters.maxAmount)) return false;
    if (filters.currency && r.currency !== filters.currency) return false;
    if (filters.dateFrom && (r.date || "").slice(0, 10) < filters.dateFrom) return false;
    if (filters.dateTo && (r.date || "").slice(0, 10) > filters.dateTo) return false;
    if (filters.name && !(r.recipient || "").toLowerCase().includes(filters.name.toLowerCase())) return false;
    return true;
  });
}

const NOUNS = {
  de: { invoice: ["Rechnung", "Rechnungen"], payment_link: ["Zahlungslink", "Zahlungslinks"], transaction: ["Transaktion", "Transaktionen"], any: ["Zahlung", "Zahlungen"] },
  en: { invoice: ["invoice", "invoices"], payment_link: ["payment link", "payment links"], transaction: ["transaction", "transactions"], any: ["payment", "payments"] },
};
const ADJ = {
  de: { open: ["offene", "offener", "offene"], paid: ["bezahlte", "bezahlter", "bezahlte"], cancelled: ["stornierte", "stornierter", "stornierte"] },
  en: { open: "open", paid: "paid", cancelled: "cancelled" },
};

export function summarize(rows, filters = {}, language = "en") {
  const lang = language === "de" ? "de" : "en";
  const kind = filters.kind || "any";
  const n = rows.length;
  const [one, many] = NOUNS[lang][kind];
  if (n === 0) return lang === "de" ? `Keine passenden ${many} gefunden.` : `No matching ${many} found.`;
  let adj = "";
  if (filters.status) {
    if (lang === "de") {
      const forms = ADJ.de[filters.status];
      adj = (n === 1 ? (kind === "payment_link" ? forms[1] : forms[0]) : forms[2]) + " ";
    } else adj = ADJ.en[filters.status] + " ";
  }
  const count = lang === "de" ? (n === 1 ? (kind === "payment_link" ? "Ein" : "Eine") : String(n)) : n === 1 ? "One" : String(n);
  const noun = n === 1 ? one : many;
  const totals = {};
  for (const r of rows) totals[r.currency] = (totals[r.currency] || 0) + Number(r.amount || 0);
  const sum = Object.entries(totals).map(([c, v]) => spokenMoney(v.toFixed(2), c, lang)).join(lang === "de" ? " und " : " and ");
  const oldest = rows.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  let tail = "";
  if (oldest && n > 1) {
    const d = new Date(oldest.date);
    const who = oldest.recipient ? oldest.recipient.split(/\s+/)[0] : null;
    tail = lang === "de"
      ? `, älteste${who ? ` an ${who}` : ""} vom ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
      : `, oldest${who ? ` to ${who}` : ""} from ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  }
  const end = (x) => (x.endsWith(".") ? x : `${x}.`);
  return lang === "de" ? end(`${count} ${adj}${noun}, zusammen ${sum}${tail}`) : end(`${count} ${adj}${noun}, ${sum} in total${tail}`);
}

// "nächste Zeile", "next row", "lies die Zeile vor": moving through the grid by voice.
export function parseGridNav(input) {
  const t = stripWakeAndSend(input).toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (/^(?:lies\s+)?(?:die\s+)?nächste(?:\s+zeile)?(?:\s+vor)?$|^(?:read\s+(?:the\s+)?)?next(?:\s+row)?$/.test(t)) return "next";
  if (/^(?:lies\s+)?(?:die\s+)?vorherige(?:\s+zeile)?(?:\s+vor)?$|^(?:eine\s+)?zeile\s+zurück$|^(?:read\s+(?:the\s+)?)?previous(?:\s+row)?$/.test(t)) return "previous";
  if (/^(?:lies\s+)?(?:die\s+)?erste(?:\s+zeile)?(?:\s+vor)?$|^(?:read\s+(?:the\s+)?)?first(?:\s+row)?$/.test(t)) return "first";
  if (/^(?:lies\s+)?(?:die\s+)?(?:diese|aktuelle)?\s?zeile\s+vor$|^lies\s+vor$|^read\s+(?:this\s+|the\s+current\s+)?row$/.test(t)) return "current";
  return null;
}

// One grid row, as a sentence.
export function rowSentence(r, language = "en") {
  const de = language === "de";
  const kind = { invoice: de ? "Rechnung" : "Invoice", payment_link: de ? "Zahlungslink" : "Payment link", transaction: de ? "Transaktion" : "Transaction" }[r.kind] || "";
  const status = { Open: de ? "offen" : "open", Paid: de ? "bezahlt" : "paid", Cancelled: de ? "storniert" : "cancelled" }[r.statusText] || r.statusText;
  const d = r.date ? new Date(r.date) : null;
  const date = d ? (de ? `vom ${d.getUTCDate()}.${d.getUTCMonth() + 1}.` : `from ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`) : "";
  const who = r.recipient ? (de ? `an ${r.recipient}` : `to ${r.recipient}`) : "";
  return [kind, who, spokenMoney(Number(r.amount).toFixed(2), r.currency, language), r.description ? (de ? `für ${r.description}` : `for ${r.description}`) : "", status, date]
    .filter(Boolean)
    .join(", ")
    .replace(/([^.])$/, "$1.");
}
