import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDueQuery, dueSpeech } from "../src/calendar.js";

const now = new Date("2026-11-12T18:00:00Z"); // Thursday

test("due questions", () => {
  assert.deepEqual(parseDueQuery("Was wird diese Woche fällig, Jabboo?", { now }), { type: "due", language: "de", from: "2026-11-09", to: "2026-11-15", overdue: false });
  assert.deepEqual(parseDueQuery("What is due next week?", { now }), { type: "due", language: "en", from: "2026-11-16", to: "2026-11-22", overdue: false });
  assert.equal(parseDueQuery("Was ist überfällig?", { now }).overdue, true);
  assert.equal(parseDueQuery("Was wird im Dezember fällig?", { now }).from, "2025-12-01");
  assert.equal(parseDueQuery("Schick Max eine Rechnung über 50 Euro, fällig in 14 Tagen", { now }), null);
  assert.equal(parseDueQuery("Hat Max bezahlt?", { now }), null);
});

test("due answer lists open items in range, sorted, with total", () => {
  const rows = [
    { kind: "invoice", recipient: "Max Mustermann", amount: 120, currency: "EUR", statusText: "Open", due: "2026-11-13" },
    { kind: "invoice", recipient: "Anna Schmidt", amount: 270, currency: "EUR", statusText: "Open", due: "2026-11-26" },
    { kind: "invoice", recipient: "John Miller", amount: 150, currency: "USD", statusText: "Paid", due: "2026-11-12" },
    { kind: "payment_link", recipient: null, amount: 19.9, currency: "EUR", statusText: "Open", due: "2026-11-12" },
  ];
  const q = parseDueQuery("Was wird diese Woche fällig?", { now });
  assert.equal(dueSpeech(rows, q).speech, "Fällig: 2 Zahlungen. Zahlungslink 19,90 Euro am Donnerstag, 12.11., Max 120 Euro am Freitag, 13.11. Zusammen 139,90 Euro.");
  const en = parseDueQuery("What is due next week", { now });
  assert.equal(dueSpeech(rows, en).speech, "Nothing is due in that period.");
  const od = parseDueQuery("What is overdue?", { now });
  assert.equal(dueSpeech(rows, od, { today: "2026-11-14" }).speech, "Overdue: 2 payments. payment link 19.90 euros on Thursday, Nov 12, Max 120 euros on Friday, Nov 13. Total 139.90 euros.");
});
