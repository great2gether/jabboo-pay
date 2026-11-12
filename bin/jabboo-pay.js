#!/usr/bin/env node
// jabboo-pay parse "<text>"        show what was understood (no network)
// jabboo-pay create "<text>" [--yes]  create the invoice / payment link in the PayPal Sandbox
// jabboo-pay status <invoice|payment_link> <id>
// jabboo-pay serve                 local web UI on http://localhost:4242
// jabboo-pay mcp                   MCP server on stdio (Claude Desktop, Claude Code)

import { createInterface } from "node:readline/promises";
import { loadEnv, createService } from "../src/service.js";

loadEnv();
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

async function main() {
  if (cmd === "serve") {
    const { startServer } = await import("../src/server.js");
    await startServer();
    return;
  }
  if (cmd === "mcp") {
    const { startMcp } = await import("../src/mcp.js");
    startMcp();
    return;
  }
  const service = createService();
  if (cmd === "parse") {
    console.log(JSON.stringify(service.parse(args.join(" ")), null, 2));
    return;
  }
  if (cmd === "create") {
    const parsed = service.parse(args.join(" "));
    console.log(parsed.summary);
    if (!parsed.ok) {
      console.error(`Missing: ${parsed.missing.join(", ")}`);
      process.exitCode = 2;
      return;
    }
    if (!flags.has("--yes")) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question("Create in PayPal Sandbox? [y/N] ")).trim().toLowerCase();
      rl.close();
      if (!["y", "yes", "j", "ja"].includes(answer)) return console.log("Cancelled.");
    }
    const r = await service.create(parsed);
    console.log(`${r.kind} ${r.id} ${r.status}`);
    console.log(r.link);
    return;
  }
  if (cmd === "status") {
    const [kind, id] = args;
    console.log(JSON.stringify(await service.status(kind, id), null, 2));
    return;
  }
  console.log(`Usage:
  jabboo-pay parse "Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin"
  jabboo-pay create "Send John an invoice for 80 dollars for consulting" [--yes]
  jabboo-pay status invoice INV2-XXXX-XXXX-XXXX-XXXX
  jabboo-pay serve      # web UI on http://localhost:4242
  jabboo-pay mcp        # MCP server (stdio)`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}${err.debugId ? ` (PayPal debug id ${err.debugId})` : ""}`);
  process.exitCode = 1;
});
