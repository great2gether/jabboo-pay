# Devpost submission – Jabboo Pay

Copy each block into the matching Devpost field. Everything is in English as required.

## Form checklist (do not paste)

- **Sponsor tools:** select **AG Grid** (required for the AG Grid sponsor prize). No other sponsor tool.
- **Built with:** paste the tag list below (contains `ag-grid`).
- **Repository:** public GitHub repo, MIT license visible in “About”.
- **Video:** public YouTube link, under 3:00.
- **Demo:** “Setup instructions in the README” (local app; judges don’t have to run it, the video shows everything).

---

## Project name

Jabboo Pay

## Elevator pitch (max. 200 characters)

A blind user runs PayPal by voice: speaks, hears every step, searches invoices in an accessible AG Grid, each step in a tamper-evident audit chain. Claude can too – a human always says yes.

## Built with (tags)

javascript, node.js, paypal, paypal-invoicing-api, paypal-orders-api, paypal-transaction-search, paypal-sandbox, ag-grid, accessibility, wcag, voice, speech-recognition, text-to-speech, sha-256, mcp, model-context-protocol, claude, nvidia-parakeet, apple-vision, swift, macos

## Try it out (links)

- Repository: https://github.com/great2gether/jabboo-pay
- Video: <YOUTUBE LINK>
- Jabboo (the dictation app): https://jabboo.app

---

## About the project

### Inspiration

Sending an invoice means a dozen small fields, dropdowns and buttons. For many people that is not a nuisance but a wall: people with tremors, arthritis, RSI or paralysis, people missing fingers, blind and low-vision users who move through forms field by field with a screen reader. Many of them are freelancers and small business owners, and they still need to get paid.

I build Jabboo, a local dictation app for macOS. Using it every day, I learned that talking is the most accessible interface we have – but only if the computer talks back, never acts on a misheard word, and can prove later what really happened.

### What it does

**A blind user runs PayPal by voice – end to end.** Jabboo Pay combines things that are usually built separately: voice in, voice out, an accessible data grid, a tamper-evident audit chain and an AI agent with a human in the loop.

1. **Speak.** “Schick Max eine PayPal-Rechnung über 50 Euro für das Shopware-Plugin.” German or English, spoken numbers, decimals, quantities (“3 hours at 80 dollars”), due dates, contacts with fuzzy matching.
2. **Hear every step.** “Invoice to Max for 50 euros for Shopware plugin. Say yes to create it, or cancel.” Missing details are said out loud too. “Repeat” repeats it.
3. **Confirm.** Only after “yes” Jabboo Pay creates and issues the invoice with the **PayPal Invoicing API v2**, or a pay-now link with the **Orders API v2**, and puts the payer link on the clipboard. Approved orders are captured automatically. Jabboo Pay can only request money, never send it.
4. **Ask.** “Has Max paid?” – “Yes. Max paid 50 euros for the Shopware plugin.” “What is still open?” – every unpaid item with the total, with fresh status from PayPal.
5. **Search by voice in an accessible AG Grid.** “Zeig mir alle offenen Rechnungen über 100 Euro aus diesem Monat.” The sentence becomes an AG Grid filter model across invoices, payment links and PayPal transactions (Transaction Search API), the grid filters itself, and Jabboo Pay says: “3 open invoices, 420 euros in total, oldest to Max from Nov 3.” “Next row” reads the next result aloud – the focus never leaves the dictation field.
6. **Every step notarised.** What was heard, what was read back, whether the user confirmed by voice, key, button or MCP approval, which PayPal endpoint was called and what it answered: one line each in a local log, every line chained to the previous one with SHA-256. “Verify the audit log” answers “unchanged” – or “changed from line 7”. So when someone later says “I never said that”, there is proof. This is **accountability for assisted payments**.
7. **Claude can do the same – a human always confirms.** A built-in MCP server gives Claude Desktop, Claude Code or any MCP client six tools: create invoice, create payment link, payment status, answer a payment question, parse a command, list contacts. The MCP client asks the human before every call, and the audit chain records it as “confirmed via MCP approval”.

The web UI targets **WCAG 2.2 AA**: keyboard only, ARIA live regions for every reply, visible focus, 44 px targets, contrast checked in light and dark mode, text up to 200 %, high-contrast mode, status as text and never colour alone. A hands-free terminal mode speaks with the offline macOS voices.

### Built with AG Grid

AG Grid Community (MIT) is the “eyes” of Jabboo Pay. It shows every PayPal invoice, payment link and transaction in one grid with sorting and column filters – and Jabboo Pay drives it by voice: a spoken search becomes a real AG Grid filter model (`setFilterModel`) on status, type, amount, currency, date range and recipient, and the result is summarised out loud. A second AG Grid shows the audit chain. We configured it for screen readers following AG Grid’s accessibility guide: `ensureDomOrder`, no row or column virtualisation, no animation, text status instead of colour, a high-contrast Quartz theme, and our own live region because AG Grid (by design) doesn’t announce changes in the focused cell. AG Grid’s keyboard navigation works unchanged for users who prefer arrow keys.

### How we built it

- **Voice in:** Jabboo runs NVIDIA Parakeet TDT 0.6B v3 on-device and types into any app; saying “Jabboo” presses Enter. Jabboo Pay accepts text from any source – Jabboo, macOS Dictation, a screen reader or a keyboard.
- **Understanding:** dependency-free parsers for payment commands, status questions, grid searches (→ AG Grid filter model) and audit questions, in German and English, with whole-word matching and spoken number words.
- **PayPal (Sandbox):** OAuth2 client credentials; Invoicing v2 create, send (without PayPal e-mailing anyone), get and list; Orders v2 create with `payment_source.paypal.experience_context`, get and capture; Transaction Search `/v1/reporting/transactions`. Sandbox 5xx answers are retried with a `PayPal-Request-Id`, so nothing is ever created twice.
- **Audit chain:** JSON Lines with canonical JSON and SHA-256 hash links, verification in one call.
- **Voice out:** Web Speech API in the browser, `say` with offline macOS voices in the terminal.
- **Agents:** MCP server (JSON-RPC 2.0 over stdio) with a `.mcp.json`, so Claude Code picks it up in the project folder.
- **Extra:** a photo of a note or order is read on the Mac with Apple Vision and goes through the same spoken confirmation.
- Zero npm dependencies (AG Grid is loaded from a CDN in the page), 45 unit tests, MIT licensed. Built with Claude Code.

### Challenges we ran into

- **Never act on a misheard word.** Every action has a spoken preview and needs an explicit “yes”; “cancel” and Esc always work; the server re-validates what the browser sends.
- **Accessible and fast at the same time.** Moving focus to a button would let a dictated “cancel” + Enter press “create”, and focusing the grid would swallow the next dictation. Focus stays in the command field; everything else is announced through live regions and speech.
- **Proof without surveillance.** The audit log has to be convincing and still private: local only, no audio, no secrets, can be turned off, and PayPal ids instead of card data.
- **Speech is messy.** “50 Euro”, “fünfzig Euro”, “12 Euro 50”, “1.250,50 €”, “für das Plugin” vs. “für Max” – all handled with explicit, tested rules.

### Accomplishments that we’re proud of

- A full PayPal billing cycle – create, share, get paid, search, check, prove – without a mouse and without reading the screen.
- A spoken sentence that turns into a live AG Grid filter and a spoken answer.
- One tested core behind voice, keyboard, screen reader, photo and AI agents, with the same audit trail for all of them.

### What we learned

- The PayPal Invoicing API fits conversational and accessible commerce: issue the invoice without PayPal’s e-mail and share the payer link in the channel the person already uses.
- Accessibility features help everyone: “what is still open?” became the question I use most.
- Agentic commerce needs the same guard rails as assisted commerce: a human yes and a verifiable record.

### What’s next for Jabboo Pay

- Built into Jabboo as a voice command, the link inserted straight into the chat with the client.
- Reminders, refunds and recurring invoices by voice; a spoken due-date calendar.
- User testing with blind and motor-impaired freelancers and disability organisations.
- Signed audit exports (PDF) for disputes.
- Live mode after a security review.

---

## Additional questions (if the form asks)

**Which PayPal APIs / products did you use?**
PayPal REST APIs in the Sandbox: OAuth2 (client credentials), Invoicing API v2 (create, send, get, list), Orders API v2 (create, get, capture), Transaction Search API (`/v1/reporting/transactions`).

**Which AI tools did you use?**
On-device speech recognition (NVIDIA Parakeet TDT 0.6B v3 via Jabboo), text-to-speech (macOS voices, Web Speech API), natural-language parsers for payment commands, status questions and grid searches, an MCP server so AI agents (Claude Desktop / Claude Code) can create and check PayPal payments as tools with human approval, Apple Vision text recognition for photos, and Claude Code for building the project.

**Which sponsor tools did you use?**
AG Grid Community – voice-controlled, screen-reader-friendly grid of all PayPal invoices, payment links, transactions and the audit chain.

**Is this a new project or an existing one?**
New – the repository was created on 12 November 2026 for this hackathon. It can take input from Jabboo, my dictation app (closed source), but all PayPal, AG Grid, audit, accessibility and MCP code in this submission is new.

**How can judges test it?**
Clone the repo, add Sandbox credentials to `.env` (enable “Invoicing” and “Transaction search” in the app’s features), `npm start`, open http://localhost:4242, type or dictate a command, then type “yes”. Try “Zeig mir alle offenen Zahlungslinks” and “Prüfe das Protokoll”. In Claude Code, open the folder – `.mcp.json` registers the MCP server. Full steps in the README. No dependencies to install.

**Team**
Atilla Boz (solo), Germany.
