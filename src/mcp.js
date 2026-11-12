// Local MCP server over stdio (JSON-RPC 2.0, one message per line), no SDK needed.
// Lets Claude Desktop, Claude Code or any MCP client create PayPal Sandbox invoices
// and payment links. The client app asks the user before each tool call.

import { createInterface } from "node:readline";
import { commandFromFields, createService } from "./service.js";

const PROTOCOL = "2025-06-18";

export const TOOLS = [
  {
    name: "parse_payment_command",
    description:
      "Parse a spoken or typed payment command (German or English), e.g. 'Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin'. Returns recipient, amount, currency, purpose and what is missing. Does not contact PayPal.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The command as dictated" } },
      required: ["text"],
    },
  },
  {
    name: "create_paypal_invoice",
    description:
      "Create and issue a PayPal Sandbox invoice (Invoicing API v2) and return the payer link. No e-mail is sent by PayPal; share the link yourself. Ask the user to confirm recipient, amount and purpose first.",
    inputSchema: {
      type: "object",
      properties: {
        recipient_name: { type: "string" },
        recipient_email: { type: "string", description: "Payer e-mail (use list_contacts to resolve a name)" },
        amount: { type: "number", description: "Total amount, e.g. 50 or 19.90" },
        unit_amount: { type: "number", description: "Price per unit if quantity > 1" },
        quantity: { type: "integer", minimum: 1 },
        unit: { type: "string", enum: ["QUANTITY", "HOURS"] },
        currency: { type: "string", enum: ["EUR", "USD", "GBP", "CHF"] },
        description: { type: "string", description: "What the invoice is for" },
        due_in_days: { type: "integer", minimum: 1 },
      },
      required: ["recipient_email", "description"],
    },
  },
  {
    name: "create_paypal_payment_link",
    description:
      "Create a PayPal Sandbox checkout order (Orders API v2) and return the approval link anyone can pay. Approved orders are captured automatically by get_payment_status.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        quantity: { type: "integer", minimum: 1 },
        unit_amount: { type: "number" },
        currency: { type: "string", enum: ["EUR", "USD", "GBP", "CHF"] },
        description: { type: "string" },
        recipient_name: { type: "string" },
      },
      required: ["description"],
    },
  },
  {
    name: "get_payment_status",
    description: "Check whether an invoice or payment link created with Jabboo Pay has been paid.",
    inputSchema: {
      type: "object",
      properties: { kind: { type: "string", enum: ["invoice", "payment_link"] }, id: { type: "string" } },
      required: ["kind", "id"],
    },
  },
  {
    name: "list_contacts",
    description: "List the names Jabboo Pay can resolve to an e-mail address (from contacts.json).",
    inputSchema: { type: "object", properties: {} },
  },
];

const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });

export function createMcpHandler(service) {
  async function callTool(name, args = {}) {
    switch (name) {
      case "parse_payment_command":
        return text(service.parse(String(args.text || "")));
      case "create_paypal_invoice":
        return text(await service.create(commandFromFields({ ...args, kind: "invoice" })));
      case "create_paypal_payment_link":
        return text(await service.create(commandFromFields({ ...args, kind: "payment_link" })));
      case "get_payment_status":
        return text(await service.status(args.kind, String(args.id || "")));
      case "list_contacts":
        return text(Object.entries(service.contacts).map(([key, c]) => ({ key, name: c.name, email: c.email })));
      default: {
        const e = new Error(`Unknown tool: ${name}`);
        e.rpc = -32602;
        throw e;
      }
    }
  }

  // Returns the response object, or null for notifications.
  return async function handle(msg) {
    const { id, method, params } = msg || {};
    const reply = (result) => ({ jsonrpc: "2.0", id, result });
    const fail = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
    if (id === undefined || id === null) return null; // notification
    try {
      switch (method) {
        case "initialize":
          return reply({
            protocolVersion: params?.protocolVersion || PROTOCOL,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "jabboo-pay", version: "0.1.0" },
            instructions:
              "Jabboo Pay creates PayPal Sandbox invoices and payment links from voice commands. Always show the user recipient, amount, currency and purpose and get a yes before calling a create_* tool.",
          });
        case "ping":
          return reply({});
        case "tools/list":
          return reply({ tools: TOOLS });
        case "tools/call":
          try {
            return reply(await callTool(params?.name, params?.arguments));
          } catch (err) {
            if (err.rpc) return fail(err.rpc, err.message);
            return reply({ ...text(`Error: ${err.message}${err.debugId ? ` (PayPal debug id ${err.debugId})` : ""}`), isError: true });
          }
        default:
          return fail(-32601, `Method not found: ${method}`);
      }
    } catch (err) {
      return fail(-32603, err.message);
    }
  };
}

export function startMcp({ service = createService(), input = process.stdin, output = process.stdout } = {}) {
  const handle = createMcpHandler(service);
  const rl = createInterface({ input });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      output.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      return;
    }
    const res = await handle(msg);
    if (res) output.write(JSON.stringify(res) + "\n");
  });
  return rl;
}
