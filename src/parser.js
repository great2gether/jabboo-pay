// Voice command -> structured PayPal request. Pure, no I/O, no logging.
//
// parseCommand("Schick Max eine PayPal-Rechnung über 50 Euro für das Shopware-Plugin, Jabboo.")
//   -> { ok: true, kind: "invoice", recipient: { name: "Max", email: "max@example.com" },
//        amount: "50.00", currency: "EUR", quantity: 1, unitAmount: "50.00",
//        description: "Shopware-Plugin", dueInDays: null, language: "de", missing: [] }
//
// The text is what a dictation app (Jabboo, macOS dictation, anything) types.
// Commands are matched on whole words only, so "Rechnungsadresse" is not "Rechnung".

import { wordsToDigits } from "./numbers.js";

const CURRENCY_WORDS = [
  [/^(euro|euros|eur|€)$/i, "EUR"],
  [/^(dollar|dollars|usd|bucks|\$)$/i, "USD"],
  [/^(pfund|pound|pounds|gbp|£)$/i, "GBP"],
  [/^(franken|franc|francs|chf)$/i, "CHF"],
];
const SYMBOLS = { "€": "EUR", "$": "USD", "£": "GBP" };
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "CHF"];

const WAKE = /^\s*(?:(?:hey|he|hej|hi|ok|okay|hallo)[\s,]+)?(?:jabboo|jabu|jabbu|jaboo|jimmy|jackson)\b[\s,.:!]*/i;
const SEND_TAIL = /[\s,.;:!-]*\b(?:jabboo|jabu|jabbu|jaboo|absenden|abschicken|send it)\s*[.!]?\s*$/i;

const INVOICE_WORDS = /\b(rechnung|rechnungen|invoice|invoices|bill|faktura|paypal-rechnung|paypal-invoice)\b/i;
const LINK_WORDS = /\b(zahlungslink|bezahllink|paylink|payment link|payment-link|zahlungs-link|link|anfordern|fordere|request|zahlungsaufforderung)\b/i;

const DE_HINTS = /(?<![\p{L}])(schick|schicke|sende|stell|stelle|erstell|erstelle|erstellen|mach|rechnung|zahlungslink|über|für|tagen|wochen|fällig|zahlbar|eine|einen|ein|das|der|dem|den|von|und|bitte|wegen)(?![\p{L}])/giu;
const EN_HINTS = /\b(send|invoice|bill|create|make|for|the|an|a|of|due|days|weeks|dollars|please|and|to|from|each|at|payment)\b/gi;

const QTY_UNITS = {
  stunden: "HOURS", stunde: "HOURS", std: "HOURS", hours: "HOURS", hour: "HOURS", h: "HOURS",
  stück: "QUANTITY", stk: "QUANTITY", pieces: "QUANTITY", piece: "QUANTITY", x: "QUANTITY",
  mal: "QUANTITY", times: "QUANTITY", lizenzen: "QUANTITY", lizenz: "QUANTITY",
  licenses: "QUANTITY", license: "QUANTITY", tage: "QUANTITY", tag: "QUANTITY",
  days: "QUANTITY", day: "QUANTITY", seats: "QUANTITY", plugins: "QUANTITY",
};

const ARTICLES = /^(?:das|die|den|dem|der|des|ein|eine|einen|einem|unser|unsere|unseren|mein|meine|meinen|the|a|an|our|my|his|her)\s+/i;
const NOT_NAMES = new Set([
  "eine", "einen", "ein", "einem", "einer", "die", "das", "den", "dem", "der", "bitte", "mal",
  "an", "a", "the", "me", "mir", "uns", "us", "paypal", "rechnung", "invoice", "link",
  "zahlungslink", "payment", "jabboo", "über", "for", "für", "to", "from", "von",
]);

// Accept a contacts map { "Max": { name, email } } and resolve spoken names.
export function normalizeName(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export function findContact(word, contacts = {}) {
  if (!word) return null;
  const n = normalizeName(word);
  if (!n) return null;
  let best = null;
  for (const [key, c] of Object.entries(contacts)) {
    const keys = [key, c.name, ...(c.aliases || [])].filter(Boolean).map(normalizeName);
    const first = c.name ? normalizeName(c.name.split(/\s+/)[0]) : null;
    if (first) keys.push(first);
    for (const k of keys) {
      if (k === n) return { key, ...c };
      if (n.length >= 4 && k.length >= 4 && editDistance(k, n) <= 1 && !best) best = { key, ...c };
    }
  }
  return best;
}

export function stripWakeAndSend(text) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  t = t.replace(WAKE, "");
  t = t.replace(SEND_TAIL, "");
  return t.trim();
}

// Spoken e-mail: "max at example dot com", "max ät beispiel punkt de".
function findEmail(text) {
  const literal = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (literal) return { email: literal[0].toLowerCase(), raw: literal[0] };
  const spoken = text.match(/\b([\w.+-]+)\s+(?:at|ät|et)\s+([\w-]+(?:\s+(?:dot|punkt)\s+[\w-]+)+)\b/i);
  if (spoken) {
    const domain = spoken[2].replace(/\s+(?:dot|punkt)\s+/gi, ".");
    return { email: `${spoken[1]}@${domain}`.toLowerCase(), raw: spoken[0] };
  }
  return null;
}

function currencyOf(word) {
  if (!word) return null;
  for (const [re, code] of CURRENCY_WORDS) if (re.test(word)) return code;
  return null;
}

function toNumber(intPart, frac) {
  const i = intPart.replace(/[.\s']/g, "");
  return Number(`${i}.${(frac || "0").padEnd(2, "0")}`);
}

// All money mentions in the text, in order. "1.250" = 1250, "12,50" = 12.5,
// "12 Euro 50" = 12.5, "€ 50" = 50.
const MONEY = new RegExp(
  String.raw`(?:([€$£])\s?)?` +
    String.raw`(\d{1,3}(?:[.'](?=\d{3}(?!\d))\d{3})+|\d+)` +
    String.raw`(?:[.,](\d{1,2})(?!\d))?` +
    String.raw`(?:\s?(euros?|eur|€|dollars?|usd|bucks|\$|pfund|pounds?|gbp|£|franken|francs?|chf)(?![\p{L}])` +
    String.raw`(?:\s(?:und\s|and\s)?(\d{1,2})(?:\s?(?:cent|cents|ct))?(?![\p{L}\d.,]|[.,]\d))?)?`,
  "giu",
);

export function findAmounts(text) {
  const out = [];
  for (const m of text.matchAll(MONEY)) {
    const [raw, sym, int, frac, word, cents] = m;
    const currency = sym ? SYMBOLS[sym] : currencyOf(word);
    const f = frac || (cents != null ? cents.padStart(2, "0") : undefined);
    const value = toNumber(int, f);
    if (Number.isFinite(value)) out.push({ value, currency, index: m.index, length: raw.length, raw: raw.trim() });
  }
  return out;
}

function formatAmount(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function detectLanguage(text) {
  const de = (text.match(DE_HINTS) || []).length + (/[äöüß]/i.test(text) ? 1 : 0);
  const en = (text.match(EN_HINTS) || []).length;
  return de >= en && de > 0 ? "de" : "en";
}

function cleanDescription(s) {
  let d = s
    .replace(/[\s,]+(?:über|in höhe von|von|of|over|worth|an|to|at)\s*$/i, "")
    .replace(/^[\s,:;-]+|[\s,.;:!-]+$/g, "")
    .replace(ARTICLES, "")
    .trim();
  if (!d) return null;
  return d.charAt(0).toUpperCase() + d.slice(1);
}

// Verbs match in any case ("Schick Max"), names must be capitalised.
const ci = (words) => words.map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join("|");
const VERB_NAME = new RegExp(
  String.raw`(?<![\p{L}])(?:${ci(["schick", "schicke", "sende", "send", "stell", "stelle", "erstell", "erstelle", "mach", "mache", "bill", "invoice", "charge", "request", "frag", "fordere", "ask"])})\s+(?:bitte\s+|please\s+)?(\p{Lu}[\p{L}'-]+)`,
  "u",
);
const PREP_NAME = new RegExp(
  String.raw`(?<![\p{L}])(?:an|to|from|von|für|for)\s+(\p{Lu}[\p{L}'-]+)(?=\s+(?:eine|einen|ein|an|a|über|for|für|in|mit|with|\d|[€$£])|[,.!?]|$)`,
  "u",
);

function findRecipient(text, contacts) {
  // 1. A known contact anywhere ("Max", "Macks" -> Max).
  const words = text.match(/[\p{L}][\p{L}'-]*/gu) || [];
  for (const w of words) {
    if (NOT_NAMES.has(w.toLowerCase())) continue;
    const c = findContact(w, contacts);
    if (c) return { word: w, contact: c };
  }
  // 2. Verb + Name / an|to|from Name ("schick Max", "invoice John", "von Lisa").
  const patterns = [VERB_NAME, PREP_NAME];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && !NOT_NAMES.has(m[1].toLowerCase()) && !/^\d/.test(m[1])) return { word: m[1], contact: null };
  }
  return null;
}

// "3 Stunden à 90 Euro", "3 Stunden Beratung à 90 Euro", "2 licenses at $49", "3 x 20 €".
const QTY = new RegExp(
  String.raw`(?<![\d.,])(\d{1,4})\s*(stunden|stunde|std|hours|hour|h|stück|stk|pieces|piece|x|mal|times|lizenzen|lizenz|licenses|license|tage|tag|days|day|seats|plugins)(?![\p{L}])` +
    String.raw`(?:((?:\s+(?!à\b|a\b|zu\b|je\b|at\b|each\b|per\b|für\b|for\b)[\p{L}-]+){1,2})\s+(?:à|a|zu|je|at|@|each|per|für|for)|\s*(?:à|a|zu|je|at|@|each|per|für|for)?)\s*(?=[€$£]?\s?\d)`,
  "iu",
);

// Main entry. contacts: { key: { name, email, aliases? } }, options.defaultCurrency.
export function parseCommand(input, contacts = {}, options = {}) {
  const defaultCurrency = (options.defaultCurrency || "EUR").toUpperCase();
  const original = stripWakeAndSend(input);
  const text = wordsToDigits(original);
  const language = detectLanguage(original);

  const kind = INVOICE_WORDS.test(text) ? "invoice" : LINK_WORDS.test(text) ? "payment_link" : "invoice";

  // Due date: "fällig in 14 Tagen", "zahlbar in 2 Wochen", "due in 30 days".
  let dueInDays = null;
  let dueSpan = null;
  const due = text.match(/\b(?:(?:fällig|zahlbar|zahlungsziel|due|payable)\s+)?(?:in|within|innerhalb von|binnen)\s+(\d{1,3})\s+(tagen|tage|tag|days|day|wochen|woche|weeks|week)\b/i);
  if (due) {
    const n = Number(due[1]);
    dueInDays = /^w/i.test(due[2]) ? n * 7 : n;
    dueSpan = [due.index, due.index + due[0].length];
  }

  // Money. Prefer mentions with a currency; ignore numbers inside the due phrase.
  const amounts = findAmounts(text).filter((a) => !dueSpan || a.index < dueSpan[0] || a.index >= dueSpan[1]);
  const withCurrency = amounts.filter((a) => a.currency);

  // Quantity x unit price: "3 Stunden à 90 Euro", "2 licenses at 49 dollars", "3 x 20 €".
  let quantity = 1;
  let unit = "QUANTITY";
  let unitAmount = null;
  let money = null;
  let qtyWords = null;
  const qty = text.match(QTY);
  if (qty) {
    const after = amounts.find((a) => a.index >= qty.index + qty[0].length && a.currency);
    if (after && Number(qty[1]) > 0) {
      quantity = Number(qty[1]);
      unit = QTY_UNITS[qty[2].toLowerCase()] || "QUANTITY";
      unitAmount = after.value;
      money = after;
      qtyWords = (qty[3] || "").trim() || null;
    }
  }
  if (!money) money = withCurrency[0] || (amounts.length === 1 ? amounts[0] : null);
  if (money && unitAmount == null) unitAmount = money.value;
  const currency = money?.currency || defaultCurrency;
  const total = unitAmount != null ? unitAmount * quantity : null;

  // Recipient and e-mail.
  const emailHit = findEmail(original);
  const rec = findRecipient(text, contacts);
  let recipient = null;
  if (rec?.contact) recipient = { name: rec.contact.name || rec.contact.key, email: rec.contact.email || null, spoken: rec.word };
  else if (rec) recipient = { name: rec.word, email: null, spoken: rec.word };
  if (emailHit) recipient = { ...(recipient || { name: emailHit.email.split("@")[0] }), email: emailHit.email };

  // Purpose: "für das Shopware-Plugin", "for the logo design", "wegen Beratung", "Betreff: …".
  let description = null;
  const purposeRe = /\b(?:für|for|wegen|betreff|regarding|zweck|verwendungszweck)\b:?\s+/gi;
  for (const m of text.matchAll(purposeRe)) {
    let rest = text.slice(m.index + m[0].length);
    if (/^[€$£]?\s?\d/.test(rest)) continue; // "für 50 Euro"
    const firstWord = rest.match(/^[\p{L}'-]+/u)?.[0];
    if (recipient && firstWord && normalizeName(firstWord) === normalizeName(recipient.spoken || "")) continue;
    // Cut at the next clause: amount, due phrase, recipient phrase or punctuation.
    rest = rest
      .split(/\s+(?:über|in höhe von|zum preis von|à|fällig|zahlbar|due|payable|innerhalb|within|an\s+[\p{Lu}]|to\s+[\p{Lu}])\b|[,;!?]|\.(?!\d)|\s(?=[€$£]?\d)/u)[0];
    if (emailHit) rest = rest.replace(emailHit.raw, "");
    const d = cleanDescription(rest);
    if (d) {
      description = d;
      break;
    }
  }
  if (!description && qtyWords) description = cleanDescription(qtyWords);
  let descriptionDefaulted = false;
  if (!description) {
    description = language === "de" ? "Leistung" : "Services";
    descriptionDefaulted = true;
  }
  if (description.length > 120) description = description.slice(0, 120).trim();

  const missing = [];
  if (total == null) missing.push("amount");
  if (total != null && !(total > 0)) missing.push("amount");
  if (!SUPPORTED_CURRENCIES.includes(currency)) missing.push("currency");
  if (kind === "invoice" && !recipient?.email) missing.push("recipient_email");

  return {
    ok: missing.length === 0,
    kind,
    recipient,
    amount: total != null ? formatAmount(total) : null,
    currency,
    quantity,
    unit,
    unitAmount: unitAmount != null ? formatAmount(unitAmount) : null,
    description,
    descriptionDefaulted,
    dueInDays,
    language,
    missing,
  };
}

// Short spoken replies while a preview waits: "bestätigen", "confirm", "abbrechen".
export function parseControl(input) {
  const t = stripWakeAndSend(input).toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (/^(?:ja|ja bitte|jawohl|bestätigen|bestätige|bestätigt|okay|ok|passt|mach los|los|go|yes|yes please|confirm|confirmed|do it|send|senden|erstellen|create)$/.test(t)) return "confirm";
  if (/^(?:nein|abbrechen|abbruch|stopp|stop|cancel|no|verwerfen|discard|lass es)$/.test(t)) return "cancel";
  return null;
}

// One line for the UI and for text-to-speech.
export function describe(cmd) {
  const de = cmd.language === "de";
  const who = cmd.recipient?.name || (de ? "unbekannt" : "unknown");
  const money = cmd.amount ? `${cmd.amount.replace(/\.00$/, "")} ${cmd.currency}` : "?";
  const what = cmd.kind === "invoice" ? (de ? "Rechnung" : "Invoice") : de ? "Zahlungslink" : "Payment link";
  const qty = cmd.quantity > 1 ? ` (${cmd.quantity} × ${cmd.unitAmount} ${cmd.currency})` : "";
  const due = cmd.dueInDays ? (de ? `, fällig in ${cmd.dueInDays} Tagen` : `, due in ${cmd.dueInDays} days`) : "";
  const subject = cmd.description ? (de ? ` für ${cmd.description}` : ` for ${cmd.description}`) : "";
  if (!cmd.recipient) return de ? `${what} über ${money}${qty}${subject}${due}` : `${what}: ${money}${qty}${subject}${due}`;
  return de ? `${what} an ${who} über ${money}${qty}${subject}${due}` : `${what} to ${who}: ${money}${qty}${subject}${due}`;
}
