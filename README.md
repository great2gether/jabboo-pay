# Jabboo Pay

**Say it. Get paid.** Jabboo Pay turns a spoken sentence into a real PayPal invoice or payment link – in the PayPal Sandbox, in about a second.

> “Schick Max eine PayPal-Rechnung über 50 Euro für das Shopware-Plugin.”
> → PayPal invoice for Max Mustermann, 50.00 EUR, item “Shopware-Plugin”, payer link on your clipboard, read back to you, and a spoken “Max just paid 50 euros” when the money arrives.

Jabboo Pay is the payments companion of [Jabboo](https://jabboo.app), a local, privacy-first dictation app for macOS (speech recognition runs offline with NVIDIA Parakeet). Jabboo types what you say into any app and presses Enter when you say “Jabboo”. Jabboo Pay listens to that text – or to any other dictation tool, keyboard or AI agent – and talks to PayPal.

- **Voice → PayPal Invoicing API v2**: create and issue an invoice, get the payer link (no PayPal e-mail is sent; you share the link where you already talk to your client).
- **Voice → PayPal Orders API v2**: a pay-now link for anyone; approved orders are captured automatically.
- **Payment status**: the UI polls PayPal and announces when it is paid.
- **MCP server**: Claude Desktop, Claude Code or any MCP client can create invoices and payment links as tools (agentic commerce, human confirmation before every call).
- **German and English**, number words (“fünfzig Euro”, “two thousand five hundred dollars”), decimals (“19,90 €”, “12 Euro 50”), quantities (“3 Stunden à 90 Euro”), due dates (“fällig in 2 Wochen”, “due in 30 days”), contacts with fuzzy name matching (“Jonh” → John).
- **Zero dependencies**, Node.js only. 25 unit tests.

## How it works

```
 you speak ──► Jabboo (on-device ASR, Parakeet) ──► text ──► Jabboo Pay parser ──► preview + “confirm”
                                                             (intent, amount,      │
                                                              currency, contact,   ▼
                                                              purpose, due date)  PayPal Sandbox REST
                                                                                  Invoicing v2 / Orders v2
                                                                                   │
                                     clipboard + spoken reply ◄── payer link ◄─────┘
                                     “Max just paid” ◄────────── status polling (auto-capture)

 Claude / any MCP client ──► jabboo-pay mcp (stdio) ──► same service ──► PayPal Sandbox
```

| File | What it does |
| --- | --- |
| `src/parser.js` | Voice command → structured request. Pure function, whole-word matching, tested. |
| `src/numbers.js` | Spoken number words → digits (DE/EN). |
| `src/paypal.js` | Minimal PayPal REST client: OAuth2 client credentials, Invoicing v2, Orders v2, capture. Sandbox only. |
| `src/service.js` | Shared glue for CLI, web UI and MCP. Logs PayPal ids only. |
| `src/server.js` + `public/index.html` | Local web UI on `127.0.0.1:4242`. |
| `src/mcp.js` | MCP server (JSON-RPC over stdio) with 5 tools. |
| `bin/jabboo-pay.js` | CLI: `parse`, `create`, `status`, `serve`, `mcp`. |

## Setup (5 minutes)

Requirements: Node.js 20.12 or newer. No `npm install` needed – there are no dependencies.

1. **Get PayPal Sandbox credentials**
   1. Log in at <https://developer.paypal.com/dashboard/> (any PayPal account works).
   2. Open **Apps & Credentials**, make sure the toggle at the top says **Sandbox**.
   3. Click **Create App**, name it `Jabboo Pay`, type **Merchant**, pick your default sandbox business account, **Create App**.
   4. Open the app, scroll to **Features**, make sure **Invoicing** is ticked (needed for invoices; payment links work without it) and **Save**.
   5. Copy **Client ID** and **Secret**.
2. **Configure**
   ```bash
   git clone https://github.com/great2gether/jabboo-pay.git
   cd jabboo-pay
   cp .env.example .env               # paste PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET
   cp contacts.example.json contacts.json
   ```
   In `contacts.json`, map spoken names to payer e-mails. To pay your own test invoices, use the e-mail of your **sandbox personal account** (developer dashboard → **Testing Tools → Sandbox Accounts**).
3. **Run**
   ```bash
   npm test                           # 25 tests, no network
   npm start                          # web UI on http://localhost:4242
   ```
4. **Talk to it**: click into the field and dictate (Jabboo, macOS Dictation via Fn Fn, or just type), press Enter. Check the preview, say or type **“confirm”** / **“bestätigen”** and Enter. The PayPal link is on your clipboard. Open it, log in with the sandbox personal account and pay – the UI says “Max just paid 50 euros”.

### CLI

```bash
node bin/jabboo-pay.js parse  "Send John an invoice for 3 hours at 80 dollars for consulting, due in 14 days"
node bin/jabboo-pay.js create "Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin"
node bin/jabboo-pay.js status invoice INV2-XXXX-XXXX-XXXX-XXXX
```

### MCP (Claude Desktop / Claude Code)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jabboo-pay": {
      "command": "node",
      "args": ["/absolute/path/to/jabboo-pay/bin/jabboo-pay.js", "mcp"]
    }
  }
}
```

or `claude mcp add jabboo-pay -- node /absolute/path/to/jabboo-pay/bin/jabboo-pay.js mcp`.

Tools: `parse_payment_command`, `create_paypal_invoice`, `create_paypal_payment_link`, `get_payment_status`, `list_contacts`. Credentials come from the `.env` next to the script; they are never passed through the model.

## Privacy and safety

- Speech never leaves the Mac: Jabboo transcribes on-device. Jabboo Pay only ever receives text.
- Only the structured request (recipient name and e-mail, amount, currency, item, due date) is sent to PayPal – nothing else, no transcript.
- Logs contain event names and PayPal ids only (enforced by a test). No names, amounts or e-mails.
- The web UI binds to `127.0.0.1` and rejects cross-origin POSTs.
- Every invoice or payment link needs an explicit confirmation (button, “confirm”, or the MCP client’s tool approval).
- This build refuses to talk to anything but `api-m.sandbox.paypal.com`.

## Why this exists

Freelancers and small shops lose money between “I’ll send you the invoice” and actually sending it. With Jabboo you already talk to your computer all day; Jabboo Pay closes the loop: say it in the chat with your client, and the link is there before you finish the sentence.

## License

MIT © 2026 Atilla Boz. See [LICENSE](LICENSE). PayPal is a trademark of PayPal, Inc.; this project is not affiliated with or endorsed by PayPal.
