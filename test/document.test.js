import { test } from "node:test";
import assert from "node:assert/strict";
import { commandFromText } from "../src/document.js";

const contacts = { Max: { name: "Max Mustermann", email: "max@example.com" } };

test("handwritten note: name, purpose, amount", () => {
  const r = commandFromText("Max Mustermann\nLogo-Design\n120 €", contacts);
  assert.equal(r.ok, true);
  assert.equal(r.kind, "invoice");
  assert.deepEqual(r.recipient, { name: "Max Mustermann", email: "max@example.com" });
  assert.equal(r.amount, "120.00");
  assert.equal(r.currency, "EUR");
  assert.equal(r.description, "Logo-Design");
});

test("order slip with total line and unknown customer e-mail", () => {
  const text = "Bestellung\nKunde: Lisa Weber\nlisa.weber@example.org\nBetreff: Website-Pflege November\nPosition 1 40,00 €\nPosition 2 25,50 €\nSumme 65,50 €";
  const r = commandFromText(text, contacts);
  assert.equal(r.amount, "65.50");
  assert.equal(r.recipient.email, "lisa.weber@example.org");
  assert.equal(r.recipient.name, "Lisa Weber");
  assert.equal(r.description, "Website-Pflege November");
  assert.equal(r.language, "de");
});

test("no e-mail -> payment link; no amount -> missing", () => {
  const a = commandFromText("Flea market table\n$35", {});
  assert.equal(a.kind, "payment_link");
  assert.equal(a.currency, "USD");
  assert.equal(a.amount, "35.00");
  assert.equal(a.description, "Flea market table");
  const b = commandFromText("Just some words", {});
  assert.deepEqual(b.missing, ["amount"]);
});

test("a name starting like a prefix word is kept (Anna, Tobias)", () => {
  const r = commandFromText("Anna Schmidt\nanna@example.com\nFotos 80 €", {});
  assert.equal(r.recipient.name, "Anna Schmidt");
});
