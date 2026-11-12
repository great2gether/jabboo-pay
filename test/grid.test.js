import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGridQuery, toFilterModel, applyFilters, summarize, parseGridNav, rowSentence } from "../src/grid.js";

const contacts = { Max: { name: "Max Mustermann", email: "max@example.com" } };
const now = new Date("2026-11-12T18:00:00Z");

test("the example from the brief", () => {
  const q = parseGridQuery("Zeig mir alle offenen Rechnungen über 100 Euro aus diesem Monat, Jabboo.", contacts, { now });
  assert.deepEqual(q.filters, { status: "open", kind: "invoice", minAmount: 100, currency: "EUR", dateFrom: "2026-11-01", dateTo: "2026-11-30" });
  assert.equal(q.language, "de");
  assert.deepEqual(toFilterModel(q.filters), {
    statusText: { filterType: "text", type: "equals", filter: "Open" },
    kindText: { filterType: "text", type: "equals", filter: "Invoice" },
    amount: { filterType: "number", type: "greaterThan", filter: 100 },
    currency: { filterType: "text", type: "equals", filter: "EUR" },
    date: { filterType: "date", type: "inRange", dateFrom: "2026-11-01 00:00:00", dateTo: "2026-11-30 00:00:00" },
  });
});

test("English, names, ranges, weeks, month names, spoken numbers", () => {
  assert.deepEqual(parseGridQuery("Show paid invoices to Max between 20 and 80 euros", contacts, { now }).filters, { status: "paid", kind: "invoice", minAmount: 20, maxAmount: 80, currency: "EUR", name: "Max" });
  assert.deepEqual(parseGridQuery("Show me everything from last week", contacts, { now }).filters, { dateFrom: "2026-11-02", dateTo: "2026-11-08" });
  assert.deepEqual(parseGridQuery("Zeig Zahlungslinks unter fünfzig Euro im Oktober", contacts, { now }).filters, { kind: "payment_link", maxAmount: 50, currency: "EUR", dateFrom: "2026-10-01", dateTo: "2026-10-31" });
  assert.deepEqual(parseGridQuery("Find transactions in the last 7 days", contacts, { now }).filters, { kind: "transaction", dateFrom: "2026-11-06", dateTo: "2026-11-12" });
  assert.equal(parseGridQuery("Zeig alles", contacts, { now }).reset, true);
  assert.equal(parseGridQuery("Filter zurücksetzen", contacts, { now }).reset, true);
});

test("commands and questions are not grid searches", () => {
  assert.equal(parseGridQuery("Schick Max eine Rechnung über 50 Euro", contacts, { now }), null);
  assert.equal(parseGridQuery("Hat Max bezahlt?", contacts, { now }), null);
});

const rows = [
  { id: "1", kind: "invoice", recipient: "Max Mustermann", amount: 150, currency: "EUR", statusText: "Open", date: "2026-11-03T00:00:00Z", description: "Plugin" },
  { id: "2", kind: "invoice", recipient: "Anna Schmidt", amount: 170, currency: "EUR", statusText: "Open", date: "2026-11-08T00:00:00Z", description: "Shop" },
  { id: "3", kind: "invoice", recipient: "John Miller", amount: 100, currency: "EUR", statusText: "Open", date: "2026-11-10T00:00:00Z" },
  { id: "4", kind: "invoice", recipient: "Lisa Weber", amount: 300, currency: "EUR", statusText: "Paid", date: "2026-11-05T00:00:00Z" },
  { id: "5", kind: "payment_link", recipient: null, amount: 19.9, currency: "EUR", statusText: "Open", date: "2026-10-20T00:00:00Z" },
];

test("server-side filter and the spoken summary", () => {
  const f = parseGridQuery("Zeig mir alle offenen Rechnungen über 99 Euro aus diesem Monat", contacts, { now }).filters;
  const hits = applyFilters(rows, f);
  assert.deepEqual(hits.map((r) => r.id), ["1", "2", "3"]);
  assert.equal(summarize(hits, f, "de"), "3 offene Rechnungen, zusammen 420 Euro, älteste an Max vom 3.11.");
  assert.equal(summarize(hits, f, "en"), "3 open invoices, 420 euros in total, oldest to Max from Nov 3.");
  assert.equal(summarize([rows[4]], { status: "open", kind: "payment_link" }, "de"), "Ein offener Zahlungslink, zusammen 19,90 Euro.");
  assert.equal(summarize([], { kind: "invoice" }, "de"), "Keine passenden Rechnungen gefunden.");
});

test("voice navigation through rows", () => {
  assert.equal(parseGridNav("Nächste Zeile, Jabboo."), "next");
  assert.equal(parseGridNav("next"), "next");
  assert.equal(parseGridNav("vorherige Zeile"), "previous");
  assert.equal(parseGridNav("Lies die Zeile vor"), "current");
  assert.equal(parseGridNav("first row"), "first");
  assert.equal(parseGridNav("Schick Max 5 Euro"), null);
  assert.equal(rowSentence(rows[0], "de"), "Rechnung, an Max Mustermann, 150 Euro, für Plugin, offen, vom 3.11.");
});
