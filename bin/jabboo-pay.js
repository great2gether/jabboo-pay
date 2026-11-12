#!/usr/bin/env node
// jabboo-pay parse "<text>"        show what was understood (no network)
// jabboo-pay create "<text>" [--yes]  create the invoice / payment link in the PayPal Sandbox
// jabboo-pay status <invoice|payment_link> <id>
// jabboo-pay serve                 local web UI on http://localhost:4242
// jabboo-pay mcp                   MCP server on stdio (Claude Desktop, Claude Code)
// jabboo-pay voice                 hands-free terminal: dictate, hear the answer, say "ja"/"yes"
// jabboo-pay ask "<question>"      "Hat Max bezahlt?", "What is still open?"
// jabboo-pay audit [today|verify]  read or verify the tamper-evident audit log

import { createInterface } from "node:readline/promises";
import { execFileSync } from "node:child_process";
import { loadEnv, createService } from "../src/service.js";
import { createSpeaker } from "../src/speak.js";

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
  const speaker = createSpeaker({ enabled: !flags.has("--quiet") && process.env.JABBOO_PAY_SPEAK !== "0" && process.platform === "darwin" });
  let last = null;
  const say = async (text, lang) => {
    last = { text, lang };
    console.log(text);
    await speaker.say(text, lang);
  };

  if (cmd === "ask") {
    const r = await service.interpret(args.join(" "));
    if (r.type !== "answer") return say("That is not a question I understand. Try: Has Max paid? or: What is still open?", "en");
    return say(r.speech, r.query.language);
  }

  if (cmd === "voice") {
    // One line per dictated sentence (Jabboo presses Enter when you say "Jabboo").
    const rl = createInterface({ input: process.stdin, terminal: false });
    let pending = null;
    let pendingFlow = null;
    await say("Jabboo Pay hört zu. Sag zum Beispiel: Schick Max eine Rechnung über 50 Euro für das Plugin.", "de");
    process.stdout.write("> ");
    for await (const line of rl) {
      const text = line.trim();
      if (!text) {
        process.stdout.write("> ");
        continue;
      }
      try {
        const r = await service.interpret(text, { source: "cli" });
        if (r.type === "control" && r.control === "repeat") {
          if (last) await say(last.text, last.lang);
        } else if (r.type === "control") {
          if (!pending) await say("Es gibt gerade nichts zu bestätigen.", "de");
          else if (r.control === "cancel") {
            await say(pending.language === "de" ? "Abgebrochen. Nichts wurde erstellt." : "Cancelled. Nothing was created.", pending.language);
            service.cancel(pendingFlow, "voice");
            pending = null;
          } else {
            const cmd = pending;
            pending = null;
            const res = await service.create(cmd, { flowId: pendingFlow, confirmedBy: "voice" });
            let copied = false;
            try {
              execFileSync("pbcopy", { input: res.link });
              copied = true;
            } catch {}
            console.log(res.link);
            const de = cmd.language === "de";
            await say(
              de
                ? `Erledigt. ${cmd.kind === "invoice" ? "Die Rechnung ist erstellt" : "Der Zahlungslink ist erstellt"}${copied ? ", der Link ist in der Zwischenablage" : ""}.`
                : `Done. The ${cmd.kind === "invoice" ? "invoice" : "payment link"} is ready${copied ? " and the link is on your clipboard" : ""}.`,
              cmd.language,
            );
          }
        } else if (r.type === "answer" || r.type === "audit" || r.type === "grid") {
          await say(r.speech, r.query.language);
        } else if (r.type === "grid_nav") {
          await say("Zeilen lesen geht in der Web-Ansicht. Frag hier zum Beispiel: Zeig mir alle offenen Rechnungen.", "de");
        } else {
          pending = r.command.ok ? r.command : null;
          pendingFlow = r.flowId;
          await say(r.speech, r.command.language);
        }
      } catch (err) {
        await say(`Das hat nicht geklappt: ${err.message}`, "de");
      }
      process.stdout.write("> ");
    }
    return;
  }

  if (cmd === "audit") {
    const { verifySpeech, auditSpeech } = await import("../src/audit.js");
    if (args[0] === "verify") {
      const v = service.audit.verify();
      await say(verifySpeech(v, "en"), "en");
      process.exitCode = v.ok ? 0 : 3;
      return;
    }
    await say(auditSpeech(service.audit.entries(), { today: args[0] === "today", language: "en" }), "en");
    return;
  }

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
    const r = await service.create(parsed, { confirmedBy: flags.has("--yes") ? "cli" : "keyboard", source: "cli" });
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
  jabboo-pay mcp        # MCP server (stdio)
  jabboo-pay voice      # hands-free: dictate, listen, say "ja" / "yes" (--quiet: no speech)
  jabboo-pay ask "Hat Max bezahlt?"
  jabboo-pay audit [today|verify]   # tamper-evident log of every step`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}${err.debugId ? ` (PayPal debug id ${err.debugId})` : ""}`);
  process.exitCode = 1;
});
