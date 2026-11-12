import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, parseControl, describe, findAmounts, stripWakeAndSend, findContact } from "../src/parser.js";
import { wordsToDigits, parseGermanNumberWord } from "../src/numbers.js";

const contacts = {
  Max: { name: "Max Mustermann", email: "max@example.com" },
  Anna: { name: "Anna Schmidt", email: "anna@example.com", aliases: ["Annie"] },
  John: { name: "John Miller", email: "john@example.com" },
};

test("the demo sentence (German, as Jabboo types it)", () => {
  const r = parseCommand("Schick Max eine PayPal-Rechnung über 50 Euro für das Shopware-Plugin, Jabboo.", contacts);
  assert.equal(r.ok, true);
  assert.equal(r.kind, "invoice");
  assert.deepEqual(r.recipient, { name: "Max Mustermann", email: "max@example.com", spoken: "Max" });
  assert.equal(r.amount, "50.00");
  assert.equal(r.currency, "EUR");
  assert.equal(r.description, "Shopware-Plugin");
  assert.equal(r.language, "de");
  assert.deepEqual(r.missing, []);
});

test("wake word and send word are stripped", () => {
  assert.equal(stripWakeAndSend("Hey Jabboo, schick Max 5 Euro, Jabboo."), "schick Max 5 Euro");
  assert.equal(stripWakeAndSend("Jimmy schick Max 5 Euro absenden"), "schick Max 5 Euro");
  assert.equal(stripWakeAndSend("send John 5 dollars, send it"), "send John 5 dollars");
});

test("English invoice with dollars and due date", () => {
  const r = parseCommand("Send John an invoice for the logo design, 250 dollars, due in 30 days", contacts);
  assert.equal(r.ok, true);
  assert.equal(r.recipient.email, "john@example.com");
  assert.equal(r.amount, "250.00");
  assert.equal(r.currency, "USD");
  assert.equal(r.description, "Logo design");
  assert.equal(r.dueInDays, 30);
  assert.equal(r.language, "en");
});

test("payment link without a recipient", () => {
  const r = parseCommand("Erstelle einen Zahlungslink über 19,90 Euro für das E-Book", contacts);
  assert.equal(r.kind, "payment_link");
  assert.equal(r.amount, "19.90");
  assert.equal(r.description, "E-Book");
  assert.equal(r.ok, true);
  assert.equal(r.recipient, null);
});

test("invoice needs an e-mail: unknown names are reported as missing", () => {
  const r = parseCommand("Schick Lisa eine Rechnung über 80 Euro für Beratung", contacts);
  assert.equal(r.ok, false);
  assert.equal(r.recipient.name, "Lisa");
  assert.deepEqual(r.missing, ["recipient_email"]);
});

test("spoken and literal e-mail addresses", () => {
  const a = parseCommand("Schick Lisa eine Rechnung über 80 Euro für Beratung an lisa at example dot com", contacts);
  assert.equal(a.recipient.email, "lisa@example.com");
  assert.equal(a.description, "Beratung");
  assert.equal(a.ok, true);
  const b = parseCommand("invoice Lisa 80 euros for consulting, lisa@example.org", contacts);
  assert.equal(b.recipient.email, "lisa@example.org");
  assert.equal(b.description, "Consulting");
});

test("number words are understood", () => {
  assert.equal(parseGermanNumberWord("zweitausendfünfhundert"), 2500);
  assert.equal(parseGermanNumberWord("neunundneunzig"), 99);
  assert.equal(parseGermanNumberWord("einhundertzwanzig"), 120);
  assert.equal(wordsToDigits("fünfzig Euro"), "50 Euro");
  assert.equal(wordsToDigits("two thousand five hundred dollars"), "2500 dollars");
  assert.equal(wordsToDigits("one hundred and twenty euros"), "120 euros");
  assert.equal(wordsToDigits("eine Rechnung über fünf hundert Euro"), "eine Rechnung über 500 Euro");
  assert.equal(wordsToDigits("an invoice for one"), "an invoice for one");
  const r = parseCommand("Schick Max eine Rechnung über fünfzig Euro für das Shopware Plugin", contacts);
  assert.equal(r.amount, "50.00");
  assert.equal(r.description, "Shopware Plugin");
});

test("decimals, thousands separators, symbols and spoken cents", () => {
  const v = (s) => findAmounts(s).map((a) => [a.value, a.currency]);
  assert.deepEqual(v("1.250 Euro"), [[1250, "EUR"]]);
  assert.deepEqual(v("1.250,50 €"), [[1250.5, "EUR"]]);
  assert.deepEqual(v("12.50 dollars"), [[12.5, "USD"]]);
  assert.deepEqual(v("$49"), [[49, "USD"]]);
  assert.deepEqual(v("€ 30"), [[30, "EUR"]]);
  assert.deepEqual(v("12 Euro 50"), [[12.5, "EUR"]]);
  assert.deepEqual(v("49 Euro und 90 Cent"), [[49.9, "EUR"]]);
  assert.deepEqual(v("20 Pfund"), [[20, "GBP"]]);
  assert.deepEqual(v("100 Franken"), [[100, "CHF"]]);
});

test("quantity times unit price", () => {
  const r = parseCommand("Stell Anna eine Rechnung über 3 Stunden à 90 Euro für Beratung", contacts);
  assert.equal(r.quantity, 3);
  assert.equal(r.unit, "HOURS");
  assert.equal(r.unitAmount, "90.00");
  assert.equal(r.amount, "270.00");
  assert.equal(r.description, "Beratung");
  const e = parseCommand("Invoice John for 2 licenses at 49 dollars each", contacts);
  assert.equal(e.quantity, 2);
  assert.equal(e.amount, "98.00");
  const w = parseCommand("Rechnung an Max für 4 Stunden Workshop à 120 Euro", contacts);
  assert.equal(w.amount, "480.00");
  assert.equal(w.description, "Workshop");
});

test("due dates in days and weeks; due numbers are not amounts", () => {
  const r = parseCommand("Rechnung an Max über 40 Euro für Hosting, fällig in 2 Wochen", contacts);
  assert.equal(r.dueInDays, 14);
  assert.equal(r.amount, "40.00");
  assert.equal(r.description, "Hosting");
  const s = parseCommand("Rechnung an Max über 40 Euro zahlbar in 10 Tagen für Hosting", contacts);
  assert.equal(s.dueInDays, 10);
  assert.equal(s.amount, "40.00");
});

test("a number without currency uses the default currency", () => {
  const r = parseCommand("Schick Max eine Rechnung über 75 für das Logo", contacts, { defaultCurrency: "USD" });
  assert.equal(r.amount, "75.00");
  assert.equal(r.currency, "USD");
});

test("missing amount is reported, description defaults", () => {
  const r = parseCommand("Schick Max eine Rechnung", contacts);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes("amount"));
  assert.equal(r.description, "Leistung");
  assert.equal(r.descriptionDefaulted, true);
});

test("misheard contact names still resolve (edit distance 1)", () => {
  assert.equal(findContact("Maks", contacts), null); // too short for fuzzy (3 letters + 1)
  assert.equal(findContact("Annie", contacts).email, "anna@example.com");
  assert.equal(findContact("Jonh", contacts).email, "john@example.com");
  assert.equal(findContact("mustermann", contacts), null);
});

test("purpose 'für' + recipient name is not taken as the purpose", () => {
  const r = parseCommand("Erstelle eine Rechnung für Max über 60 Euro für die Website-Pflege", contacts);
  assert.equal(r.recipient.email, "max@example.com");
  assert.equal(r.description, "Website-Pflege");
  assert.equal(r.amount, "60.00");
});

test("whole words only: Rechnungsadresse is no invoice keyword", () => {
  const r = parseCommand("Erstelle einen Link über 10 Euro für die Rechnungsadresse-Prüfung", contacts);
  assert.equal(r.kind, "payment_link");
});

test("controls", () => {
  assert.equal(parseControl("Bestätigen, Jabboo."), "confirm");
  assert.equal(parseControl("Ja"), "confirm");
  assert.equal(parseControl("confirm"), "confirm");
  assert.equal(parseControl("Abbrechen."), "cancel");
  assert.equal(parseControl("Wiederholen."), "repeat");
  assert.equal(parseControl("Schick Max 5 Euro"), null);
});

test("describe() reads well in both languages", () => {
  const de = parseCommand("Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin", contacts);
  assert.equal(describe(de), "Rechnung an Max Mustermann über 50 EUR für Shopware-Plugin");
  const en = parseCommand("Send John an invoice for 3 hours at 80 dollars for consulting, due in 7 days", contacts);
  assert.equal(describe(en), "Invoice to John Miller: 240 USD (3 × 80.00 USD) for Consulting, due in 7 days");
});
