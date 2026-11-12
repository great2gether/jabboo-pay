import { test } from "node:test";
import assert from "node:assert/strict";
import { createPayPalClient, PayPalError } from "../src/paypal.js";
import { createService, commandFromFields } from "../src/service.js";
import { createMcpHandler, TOOLS } from "../src/mcp.js";
import { parseCommand } from "../src/parser.js";
import { createLedger } from "../src/ledger.js";
import { createAudit } from "../src/audit.js";

// Fake PayPal Sandbox: records calls, answers like the real API.
function fakePayPal({ failInvoice = false } = {}) {
  const calls = [];
  const orders = new Map();
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body && init.body !== "grant_type=client_credentials" ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method || "GET", path, body, headers: init.headers });
    const json = (status, obj) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });
    if (path === "/v1/oauth2/token") return json(200, { access_token: "tok", expires_in: 32400 });
    if (path === "/v2/invoicing/invoices" && init.method === "POST") {
      if (failInvoice) return json(422, { name: "UNPROCESSABLE_ENTITY", debug_id: "dbg1", details: [{ field: "/primary_recipients", issue: "INVALID_EMAIL" }] });
      return json(201, { id: "INV2-AAAA-BBBB-CCCC-DDDD", status: "DRAFT" });
    }
    if (path.endsWith("/send")) return json(200, { rel: "payer-view", href: "https://www.sandbox.paypal.com/invoice/p/#INV2-AAAA-BBBB-CCCC-DDDD", method: "GET" });
    if (path.startsWith("/v2/invoicing/invoices/")) return json(200, { id: "INV2-AAAA-BBBB-CCCC-DDDD", status: "PAID", detail: { metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#INV2" } } });
    if (path === "/v2/checkout/orders") {
      orders.set("5O190127TN364715T", "PAYER_ACTION_REQUIRED");
      return json(201, { id: "5O190127TN364715T", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T" }] });
    }
    if (path.endsWith("/capture")) return json(201, { id: "5O190127TN364715T", status: "COMPLETED" });
    if (path.startsWith("/v2/checkout/orders/")) return json(200, { id: "5O190127TN364715T", status: "APPROVED" });
    return json(404, { name: "RESOURCE_NOT_FOUND" });
  };
  return { calls, fetchImpl };
}

const contacts = { Max: { name: "Max Mustermann", email: "max@example.com" } };

test("refuses to run without credentials and outside the Sandbox", () => {
  assert.throws(() => createPayPalClient({}), PayPalError);
  assert.throws(() => createPayPalClient({ clientId: "a", clientSecret: "b", baseUrl: "https://api-m.paypal.com" }), /Sandbox/);
});

test("voice command -> invoice in the Sandbox, issued without e-mail, payer link returned", async () => {
  const fake = fakePayPal();
  const client = createPayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: fake.fetchImpl, now: () => Date.UTC(2026, 10, 12) });
  const cmd = parseCommand("Schick Max eine Rechnung über 3 Stunden à 90 Euro für Beratung, fällig in 14 Tagen", contacts);
  const r = await client.createInvoice(cmd);
  assert.equal(r.id, "INV2-AAAA-BBBB-CCCC-DDDD");
  assert.match(r.link, /sandbox\.paypal\.com\/invoice\/p/);
  const create = fake.calls.find((c) => c.path === "/v2/invoicing/invoices");
  assert.equal(create.body.detail.currency_code, "EUR");
  assert.equal(create.body.detail.payment_term.due_date, "2026-11-26");
  assert.deepEqual(create.body.primary_recipients[0].billing_info, { name: { given_name: "Max", surname: "Mustermann" }, email_address: "max@example.com" });
  assert.deepEqual(create.body.items[0], { name: "Beratung", quantity: "3", unit_amount: { currency_code: "EUR", value: "90.00" }, unit_of_measure: "HOURS" });
  const send = fake.calls.find((c) => c.path.endsWith("/send"));
  assert.deepEqual(send.body, { send_to_invoicer: false, send_to_recipient: false });
  // One token for all calls.
  assert.equal(fake.calls.filter((c) => c.path === "/v1/oauth2/token").length, 1);
});

test("payment link via Orders v2; approved orders get captured on status check", async () => {
  const fake = fakePayPal();
  const client = createPayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: fake.fetchImpl });
  const cmd = parseCommand("Erstelle einen Zahlungslink über 19,90 Euro für das E-Book", contacts);
  const r = await client.createOrder(cmd, { returnUrl: "http://localhost:4242/return" });
  assert.equal(r.kind, "payment_link");
  assert.match(r.link, /checkoutnow/);
  const order = fake.calls.find((c) => c.path === "/v2/checkout/orders").body;
  assert.equal(order.purchase_units[0].amount.value, "19.90");
  assert.equal(order.payment_source.paypal.experience_context.shipping_preference, "NO_SHIPPING");
  const s = await client.getOrder(r.id);
  assert.equal(s.paid, true);
  assert.ok(fake.calls.some((c) => c.path.endsWith("/capture")));
});

test("PayPal errors carry the debug id but no request data", async () => {
  const fake = fakePayPal({ failInvoice: true });
  const client = createPayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: fake.fetchImpl });
  const cmd = parseCommand("Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin", contacts);
  await assert.rejects(client.createInvoice(cmd), (e) => {
    assert.equal(e.debugId, "dbg1");
    assert.doesNotMatch(e.message, /max@example|Shopware|secret/);
    return true;
  });
});

test("service refuses incomplete commands and logs ids only", async () => {
  const fake = fakePayPal();
  const client = createPayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: fake.fetchImpl });
  const service = createService({ env: {}, client, contacts, ledger: createLedger(null), audit: createAudit(null) });
  await assert.rejects(service.create(service.parse("Schick Lisa eine Rechnung über 5 Euro")), /recipient_email/);
  const writes = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => (writes.push(String(s)), true);
  try {
    await service.create(service.parse("Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin"));
  } finally {
    process.stderr.write = orig;
  }
  const out = writes.join("");
  assert.match(out, /INV2-AAAA/);
  assert.doesNotMatch(out, /Max|Shopware|50|example\.com/);
});

test("structured input validation (MCP / agents)", () => {
  assert.throws(() => commandFromFields({ kind: "invoice", amount: 10, description: "x" }), /recipient_email/);
  assert.throws(() => commandFromFields({ kind: "payment_link", amount: -1 }), /positive/);
  assert.throws(() => commandFromFields({ kind: "payment_link", amount: 5, currency: "XYZ" }), /currency/);
  const c = commandFromFields({ kind: "invoice", recipient_email: "a@b.de", unit_amount: 20, quantity: 3, description: "Tickets" });
  assert.equal(c.amount, "60.00");
});

test("MCP: initialize, tools/list, tools/call", async () => {
  const fake = fakePayPal();
  const client = createPayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: fake.fetchImpl });
  const handle = createMcpHandler(createService({ env: {}, client, contacts, ledger: createLedger(null), audit: createAudit(null) }));
  const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(init.result.serverInfo.name, "jabboo-pay");
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  const parsed = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "parse_payment_command", arguments: { text: "Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin" } } });
  assert.equal(JSON.parse(parsed.result.content[0].text).amount, "50.00");
  const inv = await handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "create_paypal_invoice", arguments: { recipient_email: "max@example.com", recipient_name: "Max", amount: 50, currency: "EUR", description: "Shopware plugin" } } });
  assert.match(JSON.parse(inv.result.content[0].text).link, /invoice\/p/);
  const bad = await handle({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "create_paypal_invoice", arguments: { amount: 50, description: "x" } } });
  assert.equal(bad.result.isError, true);
  const unknown = await handle({ jsonrpc: "2.0", id: 6, method: "nope" });
  assert.equal(unknown.error.code, -32601);
});

test("retries Sandbox 503s with one PayPal-Request-Id; explains missing invoicing permission", async () => {
  let n = 0;
  const ids = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const json = (status, obj) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });
    if (path === "/v1/oauth2/token") return json(200, { access_token: "tok", expires_in: 32400 });
    if (path === "/v2/checkout/orders") {
      ids.push(init.headers["PayPal-Request-Id"]);
      if (++n < 3) return json(503, {});
      return json(201, { id: "ORDER1", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1" }] });
    }
    if (path === "/v2/invoicing/invoices") return json(403, { name: "NOT_AUTHORIZED", debug_id: "d2" });
    return json(404, {});
  };
  const client = createPayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl, retryDelayMs: 1 });
  const r = await client.createOrder(parseCommand("Erstelle einen Zahlungslink über 5 Euro für Test", contacts));
  assert.equal(r.id, "ORDER1");
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 1);
  await assert.rejects(client.createInvoice(parseCommand("Schick Max eine Rechnung über 5 Euro für Test", contacts)), /Features.*Invoicing/);
});
