// Minimal PayPal REST client for the Sandbox: OAuth, Invoicing v2, Orders v2.
// No SDK, no dependencies. Errors never contain credentials or request bodies.

import { randomUUID } from "node:crypto";

export const SANDBOX_API = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(message, { status, name, debugId, details } = {}) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.paypalName = name;
    this.debugId = debugId;
    this.details = details;
  }
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return { given_name: parts[0] };
  return { given_name: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

export function createPayPalClient({ clientId, clientSecret, fetchImpl = globalThis.fetch, baseUrl = SANDBOX_API, now = () => Date.now(), retryDelayMs = 800 } = {}) {
  if (!clientId || !clientSecret) {
    throw new PayPalError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are missing. Copy .env.example to .env and add your Sandbox app credentials.");
  }
  if (!/sandbox\.paypal\.com/.test(baseUrl)) {
    throw new PayPalError("Jabboo Pay only talks to the PayPal Sandbox in this version.");
  }
  let token = null;
  let tokenExpires = 0;

  async function getToken() {
    if (token && now() < tokenExpires - 60_000) return token;
    const res = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new PayPalError("PayPal Sandbox rejected the credentials (check Client ID and Secret, Sandbox tab).", {
        status: res.status,
        name: body.error,
      });
    }
    token = body.access_token;
    tokenExpires = now() + (Number(body.expires_in) || 3000) * 1000;
    return token;
  }

  // The Sandbox answers 503 now and then. POSTs carry a PayPal-Request-Id, so a
  // retry can never create a second invoice or order.
  async function call(method, path, body, extraHeaders = {}) {
    const t = await getToken();
    const requestId = method === "POST" ? randomUUID() : undefined;
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
            ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
            ...extraHeaders,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        if (attempt === 2) throw new PayPalError(`PayPal is not reachable (${err.code || err.message}).`);
        res = null;
      }
      if (res && res.status < 500) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
    }
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      if (res.status === 403 && path.startsWith("/v2/invoicing")) {
        throw new PayPalError("This PayPal app may not create invoices yet: developer.paypal.com → Apps & Credentials → your app → Features → tick “Invoicing” → Save.", {
          status: 403,
          name: json.name,
          debugId: json.debug_id,
        });
      }
      const issue = json.details?.[0]?.issue || json.details?.[0]?.description;
      throw new PayPalError(`PayPal ${method} ${path.split("/").slice(0, 4).join("/")} failed: ${json.name || res.status}${issue ? ` (${issue})` : ""}`, {
        status: res.status,
        name: json.name,
        debugId: json.debug_id,
        details: (json.details || []).map((d) => ({ field: d.field, issue: d.issue })),
      });
    }
    return json;
  }

  // --- Invoicing v2 -------------------------------------------------------
  // cmd: { recipient: { name, email }, amount, unitAmount, quantity, unit, currency, description, dueInDays }
  async function createInvoice(cmd, { invoicerName, note } = {}) {
    const today = new Date(now());
    const detail = {
      currency_code: cmd.currency,
      invoice_date: isoDate(today),
      note: note || "Created by voice with Jabboo Pay.",
      payment_term: cmd.dueInDays
        ? { due_date: isoDate(new Date(today.getTime() + cmd.dueInDays * 86_400_000)) }
        : { term_type: "DUE_ON_RECEIPT" },
    };
    const invoice = {
      detail,
      ...(invoicerName ? { invoicer: { business_name: invoicerName } } : {}),
      primary_recipients: [
        {
          billing_info: {
            ...(splitName(cmd.recipient?.name) ? { name: splitName(cmd.recipient.name) } : {}),
            email_address: cmd.recipient.email,
          },
        },
      ],
      items: [
        {
          name: cmd.description.slice(0, 200),
          quantity: String(cmd.quantity || 1),
          unit_amount: { currency_code: cmd.currency, value: cmd.unitAmount || cmd.amount },
          unit_of_measure: cmd.unit === "HOURS" ? "HOURS" : "QUANTITY",
        },
      ],
      configuration: { allow_tip: false, tax_calculated_after_discount: true, tax_inclusive: false },
    };
    const created = await call("POST", "/v2/invoicing/invoices", invoice);
    const id = created.id || created.href?.split("/").pop();
    if (!id) throw new PayPalError("PayPal did not return an invoice id.");
    // Mark as sent without e-mailing anyone: we hand the link over ourselves.
    const sent = await call("POST", `/v2/invoicing/invoices/${id}/send`, {
      send_to_invoicer: false,
      send_to_recipient: false,
    });
    let link = sent.href && /invoice\/p/.test(sent.href) ? sent.href : sent.links?.find((l) => l.rel === "payer-view")?.href;
    let status = "SENT";
    if (!link) {
      const full = await call("GET", `/v2/invoicing/invoices/${id}`);
      link = full.detail?.metadata?.recipient_view_url;
      status = full.status || status;
    }
    return { kind: "invoice", id, status, link, amount: cmd.amount, currency: cmd.currency };
  }

  async function getInvoice(id) {
    const inv = await call("GET", `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
    return {
      kind: "invoice",
      id: inv.id,
      status: inv.status,
      paid: inv.status === "PAID" || inv.status === "MARKED_AS_PAID",
      link: inv.detail?.metadata?.recipient_view_url,
    };
  }

  // --- Orders v2 (payment link) -----------------------------------------
  async function createOrder(cmd, { returnUrl, cancelUrl, brandName = "Jabboo Pay" } = {}) {
    const quantity = cmd.quantity || 1;
    const unit = cmd.unitAmount || cmd.amount;
    const order = {
      intent: "CAPTURE",
      purchase_units: [
        {
          description: cmd.description.slice(0, 127),
          amount: {
            currency_code: cmd.currency,
            value: cmd.amount,
            breakdown: { item_total: { currency_code: cmd.currency, value: cmd.amount } },
          },
          items: [
            {
              name: cmd.description.slice(0, 127),
              quantity: String(quantity),
              unit_amount: { currency_code: cmd.currency, value: unit },
              category: "DIGITAL_GOODS",
            },
          ],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: brandName,
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            ...(returnUrl ? { return_url: returnUrl } : {}),
            ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
          },
        },
      },
    };
    const created = await call("POST", "/v2/checkout/orders", order);
    const link = created.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!created.id || !link) throw new PayPalError("PayPal did not return an approval link for the order.");
    return { kind: "payment_link", id: created.id, status: created.status, link, amount: cmd.amount, currency: cmd.currency };
  }

  // Status; an approved order is captured right away so the money actually moves.
  async function getOrder(id, { autoCapture = true } = {}) {
    let order = await call("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`);
    if (autoCapture && order.status === "APPROVED") {
      order = await call("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {});
    }
    return {
      kind: "payment_link",
      id: order.id,
      status: order.status,
      paid: order.status === "COMPLETED",
      link: order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href,
    };
  }

  return { getToken, createInvoice, getInvoice, createOrder, getOrder };
}
