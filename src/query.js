// Spoken questions about payments, and spoken answers. Pure, no I/O.
//   "Wurde die Rechnung an Max bezahlt?"  -> { type: "status", name: "Max", language: "de" }
//   "Has John paid?"                       -> { type: "status", name: "John", language: "en" }
//   "Was ist noch offen?"                  -> { type: "open", language: "de" }
//   "What's still outstanding?"            -> { type: "open", language: "en" }

import { stripWakeAndSend, findContact } from "./parser.js";

const CURRENCY_NAMES = {
  de: { EUR: "Euro", USD: "Dollar", GBP: "Pfund", CHF: "Franken" },
  en: { EUR: "euros", USD: "dollars", GBP: "pounds", CHF: "Swiss francs" },
};

// "50.00 EUR" -> "50 Euro" / "19,90 Euro" / "19.90 dollars": what a speech voice reads well.
export function spokenMoney(amount, currency, language = "en") {
  const lang = language === "de" ? "de" : "en";
  let n = String(amount).replace(/\.00$/, "");
  if (lang === "de") n = n.replace(".", ",");
  return `${n} ${CURRENCY_NAMES[lang][currency] || currency}`;
}

const OPEN_RE =
  /^(?:(?:und\s+)?was\s+(?:ist|sind|steht)\s+(?:noch\s+)?(?:offen|aus)|welche\s+(?:rechnungen|zahlungen|links)\s+(?:sind\s+)?(?:noch\s+)?offen|offene\s+(?:rechnungen|zahlungen|posten)|(?:zeig|nenn|lies)\s+(?:mir\s+)?(?:die\s+)?offenen?\s+\w+(?:\s+vor)?|was\s+fehlt\s+noch|what(?:'s|\s+is|\s+are)\s+(?:still\s+)?(?:open|outstanding|unpaid|pending)|(?:list|show|read)\s+(?:me\s+)?(?:the\s+)?(?:open|outstanding|unpaid)\s+\w+|(?:open|outstanding|unpaid)\s+(?:invoices|payments)|who\s+(?:still\s+)?(?:owes|hasn't\s+paid)(?:\s+me)?|wer\s+(?:hat\s+)?(?:noch\s+)?nicht\s+bezahlt|wer\s+schuldet\s+mir\s+(?:noch\s+)?(?:geld|was))\b/i;

const STATUS_RE =
  /\b(?:bezahlt|gezahlt|beglichen|überwiesen|paid|settled)\b|\b(?:status)\b|^(?:hat|has|did|is|ist|wurde)\b/i;

const NAME_AFTER = /(?<![\p{L}])(?:[Aa]n|[Vv]on|[Ff]ür|[Tt]o|[Ff]rom|[Ff]or|[Hh]at|[Hh]as|[Dd]id)\s+(\p{Lu}[\p{L}'-]+)/u;
const STOP = new Set(["die", "der", "das", "den", "the", "rechnung", "invoice", "link", "zahlungslink", "jemand", "someone"]);

export function parseQuery(input, contacts = {}) {
  const text = stripWakeAndSend(input).replace(/[?!.]+$/g, "").trim();
  if (!text) return null;
  const language = /\b(wurde|hat|ist|was|wer|welche|offen|bezahlt|rechnung|noch|zeig|nenn)\b/i.test(text) ? "de" : "en";
  if (OPEN_RE.test(text)) return { type: "open", language };
  if (!STATUS_RE.test(text)) return null;
  // Must look like a question about a payment, not a new command.
  if (/\b(schick|sende|stell|erstell|send|create|make|bill|über\s+\d|for\s+\d)\b/i.test(text) && !/\b(bezahlt|paid)\b/i.test(text)) return null;
  let name = null;
  for (const w of text.match(/[\p{L}][\p{L}'-]*/gu) || []) {
    if (STOP.has(w.toLowerCase())) continue;
    const c = findContact(w, contacts);
    if (c) {
      name = c.name || c.key;
      break;
    }
  }
  if (!name) {
    const m = text.match(NAME_AFTER);
    if (m && !STOP.has(m[1].toLowerCase())) name = m[1];
  }
  if (!name && !/\b(letzte|last|latest|die rechnung|the invoice|der link|the link)\b/i.test(text)) return null;
  return { type: "status", name, language };
}

const firstName = (n) => (n || "").split(/\s+/)[0];
const sameName = (a, b) => a && b && (a.toLowerCase() === b.toLowerCase() || firstName(a).toLowerCase() === firstName(b).toLowerCase());

// entries: ledger rows with up-to-date status, newest first.
export function answerQuery(query, entries) {
  const de = query.language === "de";
  const label = (e) =>
    `${e.name ? firstName(e.name) : de ? "Zahlungslink" : "payment link"} ${spokenMoney(e.amount, e.currency, query.language)}`;

  if (query.type === "open") {
    const open = entries.filter((e) => !e.paid && !["CANCELLED", "VOIDED", "REFUNDED"].includes(e.status));
    if (open.length === 0) return de ? "Nichts offen. Alles ist bezahlt." : "Nothing is open. Everything has been paid.";
    const byCur = {};
    for (const e of open) byCur[e.currency] = (byCur[e.currency] || 0) + Number(e.amount);
    const totals = Object.entries(byCur)
      .map(([c, v]) => spokenMoney(v.toFixed(2), c, query.language))
      .join(de ? " und " : " and ");
    const list = open.slice(0, 5).map(label).join(", ");
    const more = open.length > 5 ? (de ? ` und ${open.length - 5} weitere` : ` and ${open.length - 5} more`) : "";
    return de
      ? `${open.length === 1 ? "Eine Zahlung ist" : `${open.length} Zahlungen sind`} offen: ${list}${more}. Zusammen ${totals}.`
      : `${open.length === 1 ? "One payment is" : `${open.length} payments are`} open: ${list}${more}. ${totals} in total.`;
  }

  const matches = query.name ? entries.filter((e) => sameName(e.name, query.name)) : entries.slice(0, 1);
  const who = query.name ? firstName(query.name) : null;
  if (matches.length === 0) {
    return de
      ? `Ich finde keine Rechnung${who ? ` an ${who}` : ""}.`
      : `I can't find an invoice${who ? ` for ${who}` : ""}.`;
  }
  const e = matches[0];
  const money = spokenMoney(e.amount, e.currency, query.language);
  const what = e.description ? (de ? ` für ${e.description}` : ` for ${e.description}`) : "";
  const name = firstName(e.name) || (de ? "Jemand" : "Someone");
  if (e.paid) return de ? `Ja. ${name} hat ${money}${what} bezahlt.` : `Yes. ${name} paid ${money}${what}.`;
  if (["CANCELLED", "VOIDED"].includes(e.status)) return de ? `Die Rechnung über ${money} wurde storniert.` : `The invoice for ${money} was cancelled.`;
  return de
    ? `Noch nicht. Die ${e.kind === "invoice" ? "Rechnung" : "Zahlung"}${e.name ? ` an ${name}` : ""} über ${money}${what} ist offen.`
    : `Not yet. The ${e.kind === "invoice" ? "invoice" : "payment link"}${e.name ? ` for ${name}` : ""} over ${money}${what} is still open.`;
}

// What the app says before it creates anything.
export function confirmationPrompt(cmd) {
  const de = cmd.language === "de";
  const money = spokenMoney(cmd.amount, cmd.currency, cmd.language);
  const who = cmd.recipient?.name ? firstName(cmd.recipient.name) : null;
  const what = cmd.description ? (de ? ` für ${cmd.description}` : ` for ${cmd.description}`) : "";
  const qty = cmd.quantity > 1 ? (de ? `, ${cmd.quantity} mal ${spokenMoney(cmd.unitAmount, cmd.currency, "de")}` : `, ${cmd.quantity} times ${spokenMoney(cmd.unitAmount, cmd.currency, "en")}`) : "";
  const due = cmd.dueInDays ? (de ? `, fällig in ${cmd.dueInDays} Tagen` : `, due in ${cmd.dueInDays} days`) : "";
  const kind = cmd.kind === "invoice" ? (de ? "Rechnung" : "Invoice") : de ? "Zahlungslink" : "Payment link";
  if (!cmd.ok) {
    const missing = cmd.missing.map((m) =>
      de
        ? { amount: "der Betrag", recipient_email: "die E-Mail-Adresse des Empfängers", currency: "eine unterstützte Währung" }[m] || m
        : { amount: "the amount", recipient_email: "the recipient's e-mail address", currency: "a supported currency" }[m] || m,
    );
    return de ? `Da fehlt noch ${missing.join(" und ")}. Bitte sag den ganzen Satz noch einmal.` : `I still need ${missing.join(" and ")}. Please say the whole sentence again.`;
  }
  return de
    ? `${kind}${who ? ` an ${who}` : ""} über ${money}${qty}${what}${due}. Sag „ja“ zum Erstellen oder „abbrechen“.`
    : `${kind}${who ? ` to ${who}` : ""} for ${money}${qty}${what}${due}. Say "yes" to create it, or "cancel".`;
}
