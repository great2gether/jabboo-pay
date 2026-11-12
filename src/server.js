// Local web UI: dictate into the field, confirm, get the PayPal link. Binds to 127.0.0.1 only.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, createService, commandFromFields, log } from "./service.js";

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw Object.assign(new Error("Request too large"), { code: "too_large" });
  }
  return raw ? JSON.parse(raw) : {};
}

export function createApp(service, { port }) {
  const page = () => readFileSync(join(ROOT, "public", "index.html"), "utf8");
  const origin = `http://localhost:${port}`;

  return async function handler(req, res) {
    const url = new URL(req.url, origin);
    try {
      // Same-origin only: no other website may drive the local API.
      if (req.method === "POST") {
        const o = req.headers.origin;
        if (o && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return send(res, 403, { error: "forbidden" });
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return send(res, 200, page(), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/return") {
        return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Jabboo Pay</title><body style="font:18px system-ui;padding:40px;text-align:center"><h1>Payment approved ✓</h1><p>You can close this tab. Jabboo Pay captures the payment now.</p></body>`, "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        return send(res, 200, { ok: true, configured: service.configured(), contacts: Object.keys(service.contacts) });
      }
      // Whatever was said: a new command (with a spoken confirmation prompt),
      // a reply ("ja", "cancel") or a question ("Hat Max bezahlt?").
      if (req.method === "POST" && (url.pathname === "/api/interpret" || url.pathname === "/api/parse")) {
        const { text } = await readJson(req);
        return send(res, 200, await service.interpret(String(text || "").slice(0, 2000)));
      }
      if (req.method === "GET" && url.pathname === "/api/ledger") {
        return send(res, 200, service.ledger.list().slice(0, 50).map(({ id, kind, status, paid, link, name, amount, currency, description, language }) => ({ id, kind, status, paid, link, name, amount, currency, description, language })));
      }
      if (req.method === "POST" && url.pathname === "/api/create") {
        const { command: c = {} } = await readJson(req);
        // Re-validate: the browser only sends back what the parser produced.
        const command = commandFromFields({
          kind: c.kind,
          recipient_name: c.recipient?.name,
          recipient_email: c.recipient?.email,
          unit_amount: c.unitAmount,
          quantity: c.quantity,
          unit: c.unit,
          currency: c.currency,
          description: c.description,
          due_in_days: c.dueInDays,
          language: c.language,
        });
        const result = await service.create(command, { returnUrl: `${origin}/return`, cancelUrl: `${origin}/` });
        return send(res, 200, result);
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        const kind = url.searchParams.get("kind");
        const id = url.searchParams.get("id");
        if (!id || !/^[\w-]{5,64}$/.test(id)) return send(res, 400, { error: "bad id" });
        return send(res, 200, await service.status(kind, id));
      }
      return send(res, 404, { error: "not found" });
    } catch (err) {
      log("error", { code: err.code || err.paypalName || err.status, debugId: err.debugId });
      return send(res, err.status && err.status < 500 ? 400 : 500, { error: err.message, code: err.code || err.paypalName, debugId: err.debugId });
    }
  };
}

export function startServer({ port = Number(process.env.PORT) || 4242, service = createService() } = {}) {
  const server = createServer(createApp(service, { port }));
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      process.stderr.write(`Jabboo Pay running on http://localhost:${port} (PayPal Sandbox${service.configured() ? "" : ", credentials missing"})\n`);
      resolve(server);
    });
  });
}
