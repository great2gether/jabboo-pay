import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, answerQuery, spokenMoney, confirmationPrompt } from "../src/query.js";
import { parseCommand } from "../src/parser.js";
import { createService } from "../src/service.js";
import { createLedger } from "../src/ledger.js";
import { createPayPalClient } from "../src/paypal.js";

const contacts = {
  Max: { name: "Max Mustermann", email: "max@example.com" },
  John: { name: "John Miller", email: "john@example.com" },
};

test("status questions in German and English", () => {
  assert.deepEqual(parseQuery("Wurde die Rechnung an Max bezahlt?", contacts), { type: "status", name: "Max Mustermann", language: "de" });
  assert.deepEqual(parseQuery("Hat Max schon bezahlt, Jabboo?", contacts), { type: "status", name: "Max Mustermann", language: "de" });
  assert.deepEqual(parseQuery("Has John paid?", contacts), { type: "status", name: "John Miller", language: "en" });
  assert.deepEqual(parseQuery("Did Lisa pay the invoice?", contacts), { type: "status", name: "Lisa", language: "en" });
  assert.deepEqual(parseQuery("Ist die letzte Rechnung bezahlt?", contacts), { type: "status", name: null, language: "de" });
});

test("open-items questions", () => {
  for (const q of ["Was ist noch offen?", "Welche Rechnungen sind offen?", "Wer hat noch nicht bezahlt?", "What's still open?", "Who still owes me?", "List the open invoices"]) {
    assert.equal(parseQuery(q, contacts)?.type, "open", q);
  }
});

test("new commands are not mistaken for questions", () => {
  assert.equal(parseQuery("Schick Max eine Rechnung über 50 Euro für das Plugin", contacts), null);
  assert.equal(parseQuery("Send John an invoice for 80 dollars", contacts), null);
  assert.equal(parseQuery("ja", contacts), null);
});

test("spoken money reads naturally", () => {
  assert.equal(spokenMoney("50.00", "EUR", "de"), "50 Euro");
  assert.equal(spokenMoney("19.90", "EUR", "de"), "19,90 Euro");
  assert.equal(spokenMoney("19.90", "USD", "en"), "19.90 dollars");
});

const rows = [
  { id: "A", kind: "invoice", name: "Max Mustermann", amount: "50.00", currency: "EUR", description: "Shopware-Plugin", status: "SENT", paid: false },
  { id: "B", kind: "payment_link", name: null, amount: "19.90", currency: "EUR", description: "E-Book", status: "COMPLETED", paid: true },
  { id: "C", kind: "invoice", name: "John Miller", amount: "240.00", currency: "USD", description: "Consulting", status: "PAID", paid: true },
];

test("answers", () => {
  assert.equal(answerQuery({ type: "status", name: "Max Mustermann", language: "de" }, rows), "Noch nicht. Die Rechnung an Max über 50 Euro für Shopware-Plugin ist offen.");
  assert.equal(answerQuery({ type: "status", name: "John Miller", language: "en" }, rows), "Yes. John paid 240 dollars for Consulting.");
  assert.equal(answerQuery({ type: "status", name: "Lisa", language: "de" }, rows), "Ich finde keine Rechnung an Lisa.");
  assert.equal(answerQuery({ type: "open", language: "de" }, rows), "Eine Zahlung ist offen: Max 50 Euro. Zusammen 50 Euro.");
  assert.equal(answerQuery({ type: "open", language: "en" }, rows.slice(1)), "Nothing is open. Everything has been paid.");
});

test("confirmation prompt before anything is created", () => {
  const ok = parseCommand("Schick Max eine Rechnung über 3 Stunden à 90 Euro für Beratung", contacts);
  assert.equal(confirmationPrompt(ok), "Rechnung an Max über 270 Euro, 3 mal 90 Euro für Beratung. Sag „ja“ zum Erstellen oder „abbrechen“.");
  const bad = parseCommand("Schick Lisa eine Rechnung für Beratung", contacts);
  assert.match(confirmationPrompt(bad), /^Da fehlt noch der Betrag und die E-Mail-Adresse/);
});

test("interpret: command -> confirm -> ledger -> status question, all with fresh PayPal status", async () => {
  let paid = false;
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const json = (status, obj) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });
    if (path === "/v1/oauth2/token") return json(200, { access_token: "t", expires_in: 32400 });
    if (path === "/v2/invoicing/invoices") return json(201, { id: "INV2-TEST-0000-0000-0001" });
    if (path.endsWith("/send")) return json(200, { href: "https://www.sandbox.paypal.com/invoice/p/#INV2-TEST" });
    if (path.startsWith("/v2/invoicing/invoices/")) return json(200, { id: "INV2-TEST-0000-0000-0001", status: paid ? "PAID" : "SENT" });
    return json(404, {});
  };
  const client = createPayPalClient({ clientId: "a", clientSecret: "b", fetchImpl });
  const service = createService({ env: {}, client, contacts, ledger: createLedger(null) });
  const step1 = await service.interpret("Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin, Jabboo.");
  assert.equal(step1.type, "command");
  assert.match(step1.speech, /Bestätigen|„ja“/);
  assert.deepEqual(await service.interpret("Ja."), { type: "control", control: "confirm" });
  await service.create(step1.command);
  assert.match((await service.interpret("Hat Max bezahlt?")).speech, /^Noch nicht/);
  assert.match((await service.interpret("Was ist noch offen?")).speech, /Max 50 Euro/);
  paid = true;
  assert.equal((await service.interpret("Hat Max bezahlt?")).speech, "Ja. Max hat 50 Euro für Shopware-Plugin bezahlt.");
  assert.equal((await service.interpret("Was ist noch offen?")).speech, "Nichts offen. Alles ist bezahlt.");
});
