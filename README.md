# Jabboo Pay

**PayPal for everyone who can’t easily type or see.**

A blind user runs PayPal by voice: speaks, hears every step, searches invoices in an accessible **AG Grid** by voice, and every step is notarised in a **tamper-evident audit chain** – and Claude can do the same via **MCP**, but a human always confirms.

Jabboo Pay lets you create PayPal invoices and payment links by voice – and hear everything back. Say who, how much and what for. Jabboo Pay reads it back, waits for your “yes”, creates it in PayPal and tells you when it’s paid. No mouse, no small form fields, no reading required.

> 🗣 “Schick Max eine PayPal-Rechnung über 50 Euro für das Shopware-Plugin.”
> 🔊 “Rechnung an Max über 50 Euro für Shopware-Plugin. Sag ‚ja‘ zum Erstellen oder ‚abbrechen‘.”
> 🗣 “Ja.”
> 🔊 “Erledigt. Die Rechnung ist erstellt, der Link ist in der Zwischenablage.”
> … later …
> 🗣 “Hat Max bezahlt?” 🔊 “Ja. Max hat 50 Euro für Shopware-Plugin bezahlt.”

Built for people with tremors, arthritis, RSI, paralysis or missing fingers, for blind and low-vision users, and for everyone whose hands are busy. It works with [Jabboo](https://jabboo.app) – a local, privacy-first dictation app for macOS (speech recognition runs offline with NVIDIA Parakeet) – and with any other dictation tool, screen reader or keyboard.

> Sandbox build: Jabboo Pay only talks to the **PayPal Sandbox** and only **requests** money (invoices, payment links). It can never send money.

## What you can do

| Say | What happens | PayPal API |
| --- | --- | --- |
| “Schick Max eine Rechnung über 50 Euro für das Shopware-Plugin” | Spoken preview, then on “ja”: invoice created and issued, payer link on the clipboard | Invoicing v2 (create, send) |
| “Send John an invoice for 3 hours at 80 dollars for consulting, due in 14 days” | 240 USD invoice with 3 × 80 hours, due date set | Invoicing v2 |
| “Erstelle einen Zahlungslink über 19,90 Euro für das E-Book” | Pay-now link anyone can use; captured automatically when approved | Orders v2 (create, get, capture) |
| “Hat Max bezahlt?” / “Has John paid?” | Fresh status from PayPal, answered aloud | Invoicing v2 / Orders v2 (get) |
| “Was ist noch offen?” / “What’s still open?” | Every unpaid invoice and link, with the total, read aloud | Invoicing v2 / Orders v2 |
| “Zeig mir alle offenen Rechnungen über 100 Euro aus diesem Monat” | AG Grid filters itself (status, type, amount, currency, dates, recipient); “3 offene Rechnungen, zusammen 420 Euro, älteste an Max vom 3.11.” | Invoicing v2 (list), Orders v2, Transaction Search |
| “Nächste Zeile” / “next row”, “lies die Zeile vor” | Reads grid rows aloud, focus stays in the dictation field | – |
| “Prüfe das Protokoll” / “Verify the audit log”, “Lies mir das Protokoll von heute vor” | Verifies the SHA-256 chain (“unchanged” / “changed from line 7”), reads today’s steps aloud | – |
| “Was wird diese Woche fällig?” / “What is due next week?” / “Was ist überfällig?” | Open items due in that range, read aloud with weekday and total; shown in the Bryntum Calendar | Invoicing v2 (due dates) |
| “ja” / “yes”, “abbrechen” / “cancel”, “wiederholen” / “repeat” | Confirm, cancel, hear the last message again | – |
| 📷 Photo of a note, order or business card | Text recognised **on the Mac** (Apple Vision), then the same spoken preview and “yes” | Invoicing v2 / Orders v2 |
| An AI agent (Claude Desktop, Claude Code) | MCP tools with human approval per call | all of the above |

German and English, number words (“fünfzig Euro”, “two thousand five hundred dollars”), decimals and spoken cents (“19,90 €”, “12 Euro 50”), quantities, due dates, contacts with fuzzy name matching (“Jonh” → John).

## AG Grid, voice-controlled

All PayPal invoices, payment links and transactions in one [AG Grid Community](https://www.ag-grid.com/) table (MIT, loaded from jsDelivr), plus a second grid for the audit log. (PayPal notes that Transaction Search can take a while to list new Sandbox payments; invoices and links show up immediately.) A spoken search becomes a real AG Grid filter model (`setFilterModel`), the result is summarised aloud, and “next row” walks through it. Configured for screen readers: `ensureDomOrder`, no row/column virtualisation, no animation, text status, high-contrast Quartz theme, own `aria-live` region (AG Grid does not announce changes in the focused cell).

## Due-date calendar (Bryntum Calendar)

A “Due dates” tab shows the due dates of all open and paid invoices and payment links in [Bryntum Calendar](https://bryntum.com/products/calendar/) (month, week and agenda views, high-contrast theme). “Was wird diese Woche fällig?” answers aloud, writes the list as plain text for screen readers and moves the calendar to that week or month.

**License note:** Bryntum Calendar is commercial software. Jabboo Pay does **not** include any Bryntum code: the page loads the public trial package `@bryntum/calendar-trial@7.3.8` from jsDelivr at runtime, for evaluation (it shows a trial watermark). Production use needs a [Bryntum license](https://bryntum.com/products/license/). Everything else in Jabboo Pay works without the calendar.

## Accountability: tamper-evident audit log

Assisted payments need proof. Every step is one JSON line in `data/audit.jsonl` (local, git-ignored, file mode 600):

| Step | Recorded |
| --- | --- |
| `heard` | time, recognised command text, source (voice/keyboard, photo, terminal, MCP) |
| `asked` | the exact sentence that was read back |
| `confirmed` / `cancelled` | how: voice, key, button, terminal, MCP approval |
| `paypal` | endpoint, invoice/order id, status, result or PayPal debug id |

Each line contains the SHA-256 of the previous line (canonical JSON). `jabboo-pay audit verify`, the “Verify chain” button or “Prüfe das Protokoll” report “unchanged” or the first changed line. No audio, no credentials, no card data. Turn off with `JABBOO_PAY_AUDIT=0`.

## Accessibility

- **Eyes-free:** every message is spoken (Web Speech API in the browser, offline macOS voices via `say` in the terminal) *and* written to an ARIA live region for screen readers. “Repeat” repeats it. Voice can be slowed down or switched off.
- **Hands-free:** one sentence and one “yes”. Focus stays in the command field, so dictation just continues; no clicking between steps. Jabboo’s send word presses Enter for you.
- **Never by accident:** nothing is created without an explicit “yes” after the spoken preview. Esc or “cancel” always works. Missing information is said out loud (“I still need the amount”).
- **Keyboard only:** skip link, logical tab order, visible 3 px focus ring, Enter / Shift+Enter / Esc.
- **Low vision:** text contrast ≥ 4.5:1 in light and dark mode (borders ≥ 3:1), targets ≥ 44 px, A− / A+ text size up to 200 % plus browser zoom, `prefers-contrast` and Windows high-contrast (`forced-colors`) support, status as text (“✓ Paid” / “○ Open”), never colour alone.
- **Screen readers:** labelled landmarks and controls, a real table for the history, links that announce where they go and that they open a new tab. Checked with the accessibility tree; designed for VoiceOver.

Target: WCAG 2.2 level AA.

## How it works

```
 voice ─► Jabboo (on-device ASR) ─► text ─┐
 photo ─► Apple Vision (on-device OCR) ───┼─► parser ─► spoken preview ─► "yes" ─► PayPal Sandbox REST
 keyboard / screen reader ────────────────┘   (intent, amount,                   Invoicing v2 · Orders v2
                                              contact, purpose)                          │
 "Has Max paid?" ─► local ledger + fresh PayPal status ─► spoken answer ◄── link / status ┘
 AI agent ─► MCP server (stdio) ─► same core
```

| File | What it does |
| --- | --- |
| `src/parser.js`, `src/numbers.js` | Voice command → structured request (DE/EN, number words). Pure, tested. |
| `src/query.js` | Status questions, spoken answers, confirmation prompts. |
| `src/document.js`, `native/ocr.swift` | Photo → text with Apple Vision on the Mac → request. Photo deleted right away. |
| `src/paypal.js` | Minimal PayPal REST client: OAuth2, Invoicing v2, Orders v2, capture, retries with `PayPal-Request-Id`. Sandbox only. |
| `src/service.js`, `src/ledger.js` | Shared core for UI, CLI and MCP; local list of what you created (`data/`, git-ignored). |
| `src/server.js`, `public/index.html` | Accessible web UI on `127.0.0.1:4242`. |
| `src/grid.js` | Voice search → AG Grid filter model, spoken summaries, row reading. |
| `src/calendar.js` | Due-date questions and spoken answers. |
| `src/audit.js` | SHA-256 hash-chained audit log, verification, spoken summaries. |
| `src/mcp.js` | MCP server with 6 tools (`.mcp.json` for Claude Code). |
| `src/speak.js`, `bin/jabboo-pay.js` | CLI incl. hands-free `voice` mode with spoken output. |

Zero npm dependencies (AG Grid and the Bryntum Calendar trial come from a CDN in the page). 47 tests: `npm test`.

## Setup (5 minutes)

Requirements: macOS (for speech output and photo recognition; the rest runs anywhere), Node.js 20.12+. Photo recognition compiles a tiny Swift helper on first use (Xcode command line tools).

1. **PayPal Sandbox credentials**
   1. Log in at <https://developer.paypal.com/dashboard/>.
   2. **Apps & Credentials**, toggle at the top on **Sandbox**.
   3. **Create App** → name `Jabboo Pay`, type **Merchant** → **Create App**.
   4. In the app under **Features**, tick **Invoicing** and **Transaction search** (needed for invoices and the transactions in the grid; payment links work without them) → **Save**.
   5. Copy **Client ID** and **Secret**.
2. **Configure**
   ```bash
   git clone https://github.com/great2gether/jabboo-pay.git
   cd jabboo-pay
   cp .env.example .env               # paste PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET
   cp contacts.example.json contacts.json
   ```
   `contacts.json` maps spoken names to payer e-mails. To pay your own test invoices, use your **sandbox personal account** (dashboard → **Testing Tools → Sandbox Accounts**).
3. **Run**
   ```bash
   npm test
   npm start                          # http://localhost:4242
   ```
4. **Talk to it:** dictate into the field (Jabboo, macOS Dictation, or type), Enter. Listen, say “yes”. Open the link, pay with the sandbox personal account – Jabboo Pay says “Max just paid”.

### Hands-free terminal

```bash
node bin/jabboo-pay.js voice           # dictate a line, hear the answer, say "ja" / "yes"
node bin/jabboo-pay.js ask "Was ist noch offen?"
node bin/jabboo-pay.js create "Send John an invoice for 80 dollars for consulting"
node bin/jabboo-pay.js audit verify     # or: audit today
```

### MCP (Claude Desktop / Claude Code)

```json
{
  "mcpServers": {
    "jabboo-pay": { "command": "node", "args": ["/absolute/path/to/jabboo-pay/bin/jabboo-pay.js", "mcp"] }
  }
}
```

In Claude Code just open the project folder: `.mcp.json` registers the server. Or `claude mcp add jabboo-pay -- node /absolute/path/to/jabboo-pay/bin/jabboo-pay.js mcp`. Every create call needs your approval in the MCP client and is recorded in the audit log as “confirmed via MCP approval”.

Tools: `parse_payment_command`, `create_paypal_invoice`, `create_paypal_payment_link`, `get_payment_status`, `ask_payment_question`, `list_contacts`. Credentials stay in `.env`; they never pass through the model.

## Privacy and safety

- Voice and photos are processed on the Mac. Jabboo Pay receives text; photos are deleted right after recognition.
- Only the structured request (recipient name and e-mail, amount, currency, item, due date) goes to PayPal.
- Logs contain event names and PayPal ids only – a unit test fails if a name, amount or e-mail shows up.
- The web UI binds to `127.0.0.1`, rejects cross-origin requests and re-validates every request on the server.
- Sandbox only, requests money only, explicit “yes” for every invoice or link.

## License

MIT © 2026 Atilla Boz. See [LICENSE](LICENSE). PayPal is a trademark of PayPal, Inc.; this project is not affiliated with or endorsed by PayPal.
