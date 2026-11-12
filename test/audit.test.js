import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAudit, verifyEntries, parseAuditQuery, auditSpeech, verifySpeech, GENESIS } from "../src/audit.js";
import { createService } from "../src/service.js";
import { createLedger } from "../src/ledger.js";
import { createPayPalClient } from "../src/paypal.js";

test("hash chain: every line links to the previous one", () => {
  const a = createAudit(null);
  const e1 = a.append("heard", { flow: "f1", text: "Schick Max 50 Euro" });
  const e2 = a.append("confirmed", { flow: "f1", by: "voice" });
  assert.equal(e1.prev, GENESIS);
  assert.equal(e2.prev, e1.hash);
  assert.deepEqual(a.verify(), { ok: true, count: 2, brokenAt: null, head: e2.hash });
});

test("tampering is detected and located (file on disk)", () => {
  const file = join(mkdtempSync(join(tmpdir(), "jp-audit-")), "audit.jsonl");
  const a = createAudit(file);
  a.append("heard", { flow: "f1", text: "Schick Max eine Rechnung über 50 Euro" });
  a.append("asked", { flow: "f1", speech: "Rechnung an Max über 50 Euro. Sag ja." });
  a.append("confirmed", { flow: "f1", by: "voice" });
  a.append("paypal", { flow: "f1", result: "ok", id: "INV2-1" });
  assert.equal(a.verify().ok, true);
  const lines = readFileSync(file, "utf8").trim().split("\n");
  lines[1] = lines[1].replace("50 Euro", "500 Euro"); // someone edits what was read back
  writeFileSync(file, lines.join("\n") + "\n");
  assert.deepEqual({ ok: a.verify().ok, brokenAt: a.verify().brokenAt }, { ok: false, brokenAt: 2 });
  assert.equal(verifySpeech(a.verify(), "de"), "Achtung: Das Protokoll wurde verändert, ab Zeile 2.");
  // Deleting a line breaks it too.
  writeFileSync(file, [lines[0], lines[2], lines[3]].join("\n") + "\n");
  assert.equal(verifyEntries(a.entries()).brokenAt, 2);
});

test("spoken audit queries", () => {
  assert.deepEqual(parseAuditQuery("Lies mir das Protokoll von heute vor, Jabboo."), { type: "audit", action: "read", today: true, language: "de" });
  assert.deepEqual(parseAuditQuery("Prüfe das Protokoll"), { type: "audit", action: "verify", language: "de" });
  assert.deepEqual(parseAuditQuery("Verify the audit log"), { type: "audit", action: "verify", language: "en" });
  assert.equal(parseAuditQuery("Schick Max 50 Euro"), null);
});

test("end to end: dictated, read back, confirmed by voice, PayPal id – all in the chain", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    const json = (status, obj) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });
    if (path === "/v1/oauth2/token") return json(200, { access_token: "t", expires_in: 32400 });
    if (path === "/v2/checkout/orders") return json(201, { id: "ORDER-7", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-7" }] });
    return json(404, {});
  };
  const audit = createAudit(null, { now: () => new Date("2026-11-12T17:20:00Z") });
  const service = createService({ env: {}, client: createPayPalClient({ clientId: "a", clientSecret: "b", fetchImpl }), contacts: {}, ledger: createLedger(null), audit });
  const r = await service.interpret("Erstelle einen Zahlungslink über 19,90 Euro für das E-Book, Jabboo.", { source: "voice" });
  await service.create(r.command, { flowId: r.flowId, confirmedBy: "voice" });
  const r2 = await service.interpret("Erstelle einen Zahlungslink über 5 Euro für Test");
  service.cancel(r2.flowId, "voice");
  const events = audit.entries().map((e) => e.event);
  assert.deepEqual(events, ["heard", "asked", "confirmed", "paypal", "heard", "asked", "cancelled"]);
  assert.equal(audit.entries()[3].id, "ORDER-7");
  assert.equal(audit.verify().ok, true);
  const speech = auditSpeech(audit.entries(), { today: true, language: "de", now: new Date("2026-11-12T18:00:00Z") });
  assert.match(speech, /^Heute 2 Vorgänge\. \d\d:\d\d: Zahlungslink über 19,90 Euro für E-Book, bestätigt per Stimme, bei PayPal erstellt\. \d\d:\d\d: Zahlungslink über 5 Euro für Test, abgebrochen per Stimme\.$/);
  const v = await service.interpret("Prüfe das Protokoll");
  assert.equal(v.speech, "Das Protokoll ist unverändert. 7 Einträge, Kette geprüft.");
});
