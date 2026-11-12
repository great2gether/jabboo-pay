# Devpost submission – Jabboo Pay

Copy each block into the matching Devpost field. Everything is in English as required.

---

## Project name

Jabboo Pay

## Elevator pitch (max. 200 characters)

Say “Send Max a PayPal invoice for 50 euros for the plugin” – Jabboo Pay creates it in PayPal and hands you the link. On-device speech AI, PayPal Invoicing + Orders APIs, MCP for agents.

## Built with (tags)

javascript, node.js, paypal, paypal-invoicing-api, paypal-orders-api, paypal-sandbox, mcp, model-context-protocol, claude, speech-recognition, nvidia-parakeet, macos

## Try it out (links)

- Repository: https://github.com/great2gether/jabboo-pay
- Video: <YOUTUBE LINK>
- Jabboo (the dictation app): https://jabboo.app

---

## About the project

### Inspiration

I run a small software business and talk to clients all day – in chat, in mail, in Slack. The most expensive sentence I say is “I’ll send you the invoice later”. Later turns into next week. I already dictate everything with Jabboo, my local dictation app for macOS. So the obvious question was: why can’t the sentence itself be the invoice?

### What it does

Jabboo Pay turns one spoken sentence into a real PayPal payment request:

- **“Schick Max eine PayPal-Rechnung über 50 Euro für das Shopware-Plugin.”** → a PayPal invoice (Invoicing API v2) for Max, 50.00 EUR, item “Shopware-Plugin”, issued and ready to pay. The payer link lands on the clipboard and is read back to you.
- **“Create a payment link for 19.90 euros for the e-book.”** → a PayPal checkout order (Orders API v2) with a pay-now link anyone can use. When the buyer approves, Jabboo Pay captures the payment automatically.
- **Status by voice**: Jabboo Pay watches the invoice or order and says “Max just paid 50 euros” the moment it is paid.
- **Agents can use it too**: a built-in MCP server exposes `create_paypal_invoice`, `create_paypal_payment_link`, `get_payment_status`, `parse_payment_command` and `list_contacts`, so Claude (or any MCP client) can bill a client in the middle of a conversation – always with a human confirmation.

It understands German and English, spoken numbers (“fünfzig Euro”, “two thousand five hundred dollars”), decimals and spoken cents (“19,90 €”, “12 Euro 50”), quantities (“3 hours at 80 dollars”), due dates (“due in 30 days”, “fällig in 2 Wochen”) and resolves names from a contact list, even when the speech engine mishears them slightly.

Every request shows a preview first. Nothing is created until you say or click “confirm”.

### How we built it

- **Voice**: Jabboo (my macOS dictation app) runs NVIDIA Parakeet TDT 0.6B v3 completely on-device. In continuous mode you just talk; saying “Jabboo” at the end inserts the text and presses Enter. Jabboo Pay works with any dictation tool, so judges can also use macOS Dictation or type.
- **Understanding**: a dependency-free intent parser in Node.js turns the transcript into a structured payment request: intent (invoice vs. payment link), recipient, e-mail, amount, currency, quantity, unit price, purpose and due date. It works on whole words only and has 17 dedicated unit tests, including number words in two languages and misheard names.
- **PayPal**: a small REST client talks to the PayPal Sandbox – OAuth2 client credentials, `POST /v2/invoicing/invoices` + `/send` (without PayPal e-mailing anyone, the link is shared where the conversation already happens), `GET /v2/invoicing/invoices/{id}` for status, `POST /v2/checkout/orders` with `payment_source.paypal.experience_context` for pay-now links, and automatic `capture` once an order is approved.
- **Interfaces**: a local web UI (Node `http`, plain HTML, speech synthesis for spoken feedback), a CLI, and an MCP server (JSON-RPC 2.0 over stdio) for Claude Desktop and Claude Code.
- **AI-assisted engineering**: the project was designed and built with Claude Code.
- Zero runtime dependencies, 24 tests (`npm test`), MIT licensed.

### Challenges we ran into

- **Speech is messy.** Engines write “50 Euro”, “fünfzig Euro” or “12 Euro 50”, German uses “1.250,50” where English uses “1,250.50”, and “für” can introduce the purpose (“für das Plugin”) or the person (“für Max”). The parser handles all of these with explicit, tested rules instead of guessing.
- **Not leaking anything.** Jabboo is built around privacy: no audio and no transcripts in logs. Jabboo Pay keeps that promise – logs contain PayPal ids only, and a unit test fails if a name, amount or e-mail ever shows up in the log output.
- **Safe by default.** Money should never move because a speech engine misheard you. Every action has a preview and an explicit “confirm”, and this build refuses to talk to anything but the PayPal Sandbox.

### Accomplishments that we’re proud of

- From spoken sentence to issued PayPal invoice in about a second, without touching the keyboard.
- The same service powers voice, CLI and an MCP agent – one tested core, three ways in.
- It feels like talking to a bookkeeper, not filling in a form.

### What we learned

- The PayPal Invoicing API is a great fit for conversational commerce: issuing an invoice without PayPal’s e-mail and handing over the payer link keeps the client relationship in the channel where it already lives.
- For voice, deterministic parsing plus a confirmation step beats a black box: users trust what they can see and correct.

### What’s next for Jabboo Pay

- Built into Jabboo as a voice command (“Hey Jabboo, send Max an invoice …”) with the link inserted right into the chat.
- Refunds, reminders (“remind Max about the invoice”) and recurring invoices by voice.
- Contacts from macOS Contacts instead of a JSON file.
- Optional local LLM for free-form requests, still fully on-device.
- Live mode after a security review.

---

## Additional questions (if the form asks)

**Which PayPal APIs / products did you use?**
PayPal REST APIs in the Sandbox: OAuth2 (client credentials), Invoicing API v2 (create, send, get), Orders API v2 (create, get, capture).

**Which AI tools did you use?**
On-device speech recognition with NVIDIA Parakeet TDT 0.6B v3 (via Jabboo), an intent parser for payment commands, an MCP server so AI agents (Claude Desktop / Claude Code) can create payments as tools, and Claude Code for building the project.

**Is this a new project or an existing one?**
Jabboo Pay is new – the repository was created on 12 November 2026 for this hackathon. It builds on Jabboo, my dictation app (started 4 November 2026, closed source), which only provides the text input; all PayPal and payment logic in this submission is new.

**How can judges test it?**
Clone the repo, add Sandbox credentials to `.env`, run `npm start`, open http://localhost:4242 and type or dictate a command. Full steps in the README. No dependencies to install.

**Team**
Atilla Boz (solo), Germany.
