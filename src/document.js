// Photo of a note, order or business card -> payment request.
// Text recognition runs on the Mac (Apple Vision via native/ocr.swift); this file
// turns the recognised lines into the same command shape the voice parser produces.

import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findAmounts, findContact, SUPPORTED_CURRENCIES } from "./parser.js";
import { ROOT } from "./service.js";

const TOTAL = /\b(total|gesamt|summe|betrag|endbetrag|zu zahlen|amount due|amount|balance due|preis|price)\b/i;
const PURPOSE = /^(?:betreff|leistung|beschreibung|description|item|artikel|for|für|zweck|subject|projekt|project)\s*[:\-–]?\s*(.+)$/i;
const NAME_PREFIX = /^(?:an|to|bill to|rechnung an|kunde|kundin|customer|client|name)(?:\s*[:\-–]\s*|\s+)/i;
const NAME_LINE = /^(\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){0,2})\s*$/u;

export function commandFromText(text, contacts = {}, { defaultCurrency = "EUR" } = {}) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const all = lines.join("\n");
  const language = /[äöüß]|\b(rechnung|betrag|gesamt|summe|für|leistung)\b/i.test(all) ? "de" : "en";

  // Amount: the line that says "Total"/"Summe" wins, else the largest amount with a currency.
  let money = null;
  for (const l of lines) {
    if (!TOTAL.test(l)) continue;
    const a = findAmounts(l);
    if (a.length) money = a[a.length - 1];
  }
  if (!money) {
    const withCur = lines.flatMap((l) => findAmounts(l)).filter((a) => a.currency);
    money = withCur.sort((a, b) => b.value - a.value)[0] || null;
  }
  const currency = money?.currency || defaultCurrency;

  // Recipient: e-mail address, then a known contact, then a name-looking line near the e-mail.
  const emailMatch = all.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;
  let name = null;
  let contactEmail = null;
  for (const c of Object.values(contacts)) {
    if (email && c.email && c.email.toLowerCase() === email) name = c.name;
  }
  if (!name) {
    for (const w of all.match(/\p{Lu}[\p{L}'-]+/gu) || []) {
      const c = findContact(w, contacts);
      if (c && w.length > 2) {
        name = c.name;
        if (!email && c.email) contactEmail = c.email;
        break;
      }
    }
  }
  if (!name) {
    const idx = email ? lines.findIndex((l) => l.toLowerCase().includes(email)) : -1;
    const candidates = idx > 0 ? [lines[idx - 1], lines[idx]] : lines;
    for (const l of candidates) {
      const m = l.replace(email || "\u0000", "").trim().replace(NAME_PREFIX, "").match(NAME_LINE);
      if (m && !TOTAL.test(l) && !PURPOSE.test(l)) {
        name = m[1];
        break;
      }
    }
  }
  const finalEmail = email || contactEmail;

  // Purpose: an explicit "Betreff:/Item:" line, else the first line that is not name, e-mail or amount.
  let description = null;
  for (const l of lines) {
    const m = l.match(PURPOSE);
    if (m) {
      description = m[1].replace(/[\s:–-]*[€$£]?\s?\d[\d.,]*\s*(?:€|eur|euro|usd|\$)?\s*$/i, "").trim();
      if (description) break;
    }
  }
  if (!description) {
    description = lines.find(
      (l) => !TOTAL.test(l) && !/@/.test(l) && !findAmounts(l).length && !(name && l.includes(name.split(" ")[0])) && l.length > 3,
    ) || null;
  }
  if (description) description = description.replace(/[\s:–-]+$/, "").slice(0, 120);

  const kind = finalEmail ? "invoice" : "payment_link";
  const missing = [];
  if (!money || !(money.value > 0)) missing.push("amount");
  if (!SUPPORTED_CURRENCIES.includes(currency)) missing.push("currency");
  return {
    ok: missing.length === 0,
    kind,
    recipient: name || finalEmail ? { name: name || finalEmail.split("@")[0], email: finalEmail || null } : null,
    amount: money ? money.value.toFixed(2) : null,
    unitAmount: money ? money.value.toFixed(2) : null,
    quantity: 1,
    unit: "QUANTITY",
    currency,
    description: description || (language === "de" ? "Leistung" : "Services"),
    descriptionDefaulted: !description,
    dueInDays: null,
    language,
    missing,
    source: "photo",
  };
}

// Compile the Swift helper once (needs the Xcode command line tools), then reuse it.
function ocrBinary() {
  const src = join(ROOT, "native", "ocr.swift");
  const bin = join(ROOT, ".cache", "jabboo-pay-ocr");
  if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs) {
    mkdirSync(join(ROOT, ".cache"), { recursive: true });
    execFileSync("swiftc", ["-O", "-o", bin, src], { stdio: "ignore" });
  }
  return bin;
}

export function recognizeText(imageBuffer) {
  if (process.platform !== "darwin") return Promise.reject(new Error("Photo recognition needs macOS (Apple Vision)."));
  const dir = mkdtempSync(join(tmpdir(), "jabboo-pay-"));
  const file = join(dir, "photo");
  writeFileSync(file, imageBuffer, { mode: 0o600 });
  return new Promise((resolve, reject) => {
    let bin;
    try {
      bin = ocrBinary();
    } catch {
      rmSync(dir, { recursive: true, force: true });
      return reject(new Error("Could not build the text recognition helper (install the Xcode command line tools)."));
    }
    execFile(bin, [file], { timeout: 30_000, maxBuffer: 1 << 20 }, (err, stdout) => {
      rmSync(dir, { recursive: true, force: true }); // the photo never stays on disk
      if (err) return reject(new Error("Could not read text from this image."));
      resolve(stdout);
    });
  });
}
