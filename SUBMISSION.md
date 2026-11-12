# Devpost submission – Jabboo Pay

Copy each block into the matching Devpost field. Everything is in English as required.

---

## Project name

Jabboo Pay

## Elevator pitch (max. 200 characters)

PayPal for everyone who can't easily type or see. Say "Invoice Max 50 euros for the plugin", hear it read back, say "yes" – done. Voice, photo or AI agent, all confirmed out loud.

## Built with (tags)

javascript, node.js, paypal, paypal-invoicing-api, paypal-orders-api, paypal-sandbox, accessibility, wcag, voice, speech-recognition, text-to-speech, apple-vision, swift, mcp, model-context-protocol, claude, nvidia-parakeet, macos

## Try it out (links)

- Repository: https://github.com/great2gether/jabboo-pay
- Video: <YOUTUBE LINK>
- Jabboo (the dictation app): https://jabboo.app

---

## About the project

### Inspiration

Sending an invoice means a dozen small fields, dropdowns and buttons. For many people that is not a nuisance but a wall: people with tremors, arthritis, RSI or paralysis, people missing fingers, blind and low-vision users who navigate forms field by field with a screen reader. Many of them are freelancers and small business owners, and they still need to get paid.

I build Jabboo, a local dictation app for macOS. Using it every day, I noticed that talking is the most accessible interface we have – but only if the computer also talks back and never acts on a misheard word. Jabboo Pay is that loop for PayPal.

### What it does

Jabboo Pay creates PayPal invoices and payment links by voice and confirms everything by voice.

1. **Say it:** “Schick Max eine PayPal-Rechnung über 50 Euro für das Shopware-Plugin.” (German and English, spoken numbers, decimals, quantities like “3 hours at 80 dollars”, due dates, contacts with fuzzy name matching.)
2. **Hear it:** “Invoice to Max for 50 euros for Shopware plugin. Say yes to create it, or cancel.” Missing details are said out loud too.
3. **Confirm it:** “Yes.” Only then Jabboo Pay creates and issues the invoice with the **PayPal Invoicing API v2** – or a pay-now link with the **Orders API v2** – and puts the payer link on the clipboard.
4. **Ask about it:** “Has Max paid?” → “Yes. Max paid 50 euros for the Shopware plugin.” “What is still open?” → every unpaid invoice and link with the total, with fresh status from PayPal. Approved orders are captured automatically.
5. **Or show it:** take a photo of a handwritten note, an order or a business card. Apple’s Vision framework reads it **on the Mac**, and you get the same spoken preview and “yes”.
6. **Or let an agent do it:** a built-in MCP server gives Claude Desktop, Claude Code or any MCP client six tools (create invoice, create payment link, get status, ask a payment question …), with a human approval for every call.

Accessibility is the core, not an add-on: every message goes to an ARIA live region *and* is spoken (offline macOS voices in the terminal, Web Speech API in the browser), “repeat” repeats it, the voice can be slowed down. The web UI works with the keyboard alone, keeps focus in the command field so dictation never breaks, has a visible focus ring, 44 px targets, checked contrast in light and dark mode, text up to 200 %, high-contrast mode support, and never uses colour alone. Target: WCAG 2.2 AA.

It is a Sandbox build and it can only request money – never send it.

### How we built it

- **Voice in:** Jabboo runs NVIDIA Parakeet TDT 0.6B v3 completely on-device and types into any app; saying “Jabboo” presses Enter. Jabboo Pay accepts text from any source, so it also works with macOS Dictation, a screen reader or a keyboard.
- **Understanding:** a dependency-free parser turns the sentence into a payment request (intent, recipient, e-mail, amount, currency, quantity, unit price, purpose, due date), plus a small query parser for “has X paid / what is open”. Whole-word matching, number words in two languages, 36 unit tests.
- **Photo in:** a 30-line Swift helper uses Apple Vision text recognition on the Mac; the photo is deleted right after.
- **PayPal:** a minimal REST client for the Sandbox – OAuth2 client credentials, `POST /v2/invoicing/invoices` + `/send` (PayPal doesn’t e-mail anyone; the link is shared where the conversation already happens), `GET` for status, `POST /v2/checkout/orders` with `payment_source.paypal.experience_context`, automatic `capture` after approval, retries on Sandbox 5xx with a `PayPal-Request-Id` so nothing is ever created twice.
- **Voice out:** `say` with offline system voices for the hands-free terminal mode, Web Speech API in the browser.
- **Interfaces:** accessible web UI (Node `http`, plain HTML/CSS/JS), CLI with a hands-free `voice` mode, MCP server (JSON-RPC 2.0 over stdio).
- **AI-assisted engineering:** designed and built with Claude Code.
- Zero npm dependencies, MIT licensed.

### Challenges we ran into

- **Never act on a misheard word.** Speech engines mishear. Every action therefore has a spoken preview and needs an explicit “yes”; “cancel” and Esc always work, and the server re-validates what the browser sends.
- **Speech is messy.** “50 Euro”, “fünfzig Euro”, “12 Euro 50”, “1.250,50 €” and “für das Plugin” vs. “für Max” all need explicit, tested rules.
- **Accessible without being slow.** Moving focus to a button would let a dictated “cancel” + Enter press “create”. Keeping focus in the command field and announcing through a live region solved it.
- **Privacy.** No audio and no transcripts in logs – logs hold PayPal ids only, and a test fails if a name, amount or e-mail appears. Voice and photos are processed on the Mac.

### Accomplishments that we’re proud of

- A full PayPal billing cycle – create, share, get paid, check status – without touching a mouse or reading a screen.
- One tested core behind voice, photo, keyboard, screen reader and AI agents.
- It feels like talking to a bookkeeper, not filling in a form.

### What we learned

- The PayPal Invoicing API is a great fit for conversational and accessible commerce: issue the invoice without PayPal’s e-mail and hand over the payer link in the channel the person already uses.
- For voice, a deterministic parser plus a spoken confirmation builds more trust than a black box.
- Accessibility features help everyone: the “what is still open?” question is the one I now use most.

### What’s next for Jabboo Pay

- Built into Jabboo as a voice command, with the link inserted right into the chat with the client.
- Reminders, refunds and recurring invoices by voice.
- macOS Contacts instead of a JSON file; VoiceOver user testing with disability organisations.
- Optional local LLM for free-form requests, still fully on-device.
- Live mode after a security review.

---

## Additional questions (if the form asks)

**Which PayPal APIs / products did you use?**
PayPal REST APIs in the Sandbox: OAuth2 (client credentials), Invoicing API v2 (create, send, get), Orders API v2 (create, get, capture).

**Which AI tools did you use?**
On-device speech recognition (NVIDIA Parakeet TDT 0.6B v3 via Jabboo), on-device text recognition (Apple Vision) for photos, text-to-speech (macOS voices, Web Speech API), an intent parser for payment commands and questions, an MCP server so AI agents (Claude Desktop / Claude Code) can create and check payments as tools, and Claude Code for building the project.

**Is this a new project or an existing one?**
Jabboo Pay is new – the repository was created on 12 November 2026 for this hackathon. It can take input from Jabboo, my dictation app (closed source), but all PayPal, accessibility and payment logic in this submission is new.

**How can judges test it?**
Clone the repo, add Sandbox credentials to `.env` (tick “Invoicing” in the app’s features), run `npm start`, open http://localhost:4242 and type or dictate a command, then type “yes”. Or run `node bin/jabboo-pay.js voice` in a terminal. Full steps in the README. No dependencies to install.

**Team**
Atilla Boz (solo), Germany.
