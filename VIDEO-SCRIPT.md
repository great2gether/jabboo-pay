# Video script – Jabboo Pay (target 2:30, hard limit 3:00)

Recording: QuickTime → File → New Screen Recording, with microphone. Upload to YouTube as **Public**, title “Jabboo Pay – Say it. Get paid. (PayPal AI Hackathon)”. No background music. Narration in English; the German command is part of the demo.

Prepare before recording:
- `npm start` running, browser at http://localhost:4242 (zoom 125 %), dark or light mode.
- `contacts.json`: Max → your sandbox personal account e-mail.
- Second browser window logged out of PayPal (for paying as Max).
- Jabboo running in continuous mode.

---

**0:00–0:15 · Hook** (screen: Jabboo Pay page)

> “I’m Atilla. I build software for online shops, and the most expensive sentence I say is: ‘I’ll send you the invoice later.’ So I made the sentence itself the invoice.”

**0:15–0:35 · What it is** (screen: page, point at the privacy footer)

> “This is Jabboo Pay. It works with Jabboo, my dictation app for the Mac. Speech recognition runs completely on my Mac with NVIDIA’s Parakeet model. No audio goes to the cloud. Only the finished payment request goes to PayPal.”

**0:35–1:05 · Demo 1: invoice in German** (click into the field, speak)

Say (as one sentence, then “Jabboo” to send):
> „Schick Max eine PayPal-Rechnung über fünfzig Euro für das Shopware-Plugin, Jabboo.“

Preview appears and is read back. Then say:
> „Bestätigen, Jabboo.“

> “That’s it. A real invoice in the PayPal Sandbox, created with the Invoicing API, issued, and the payer link is already on my clipboard.”

**1:05–1:30 · Pay it** (open the link, log in as the sandbox personal account, pay)

> “Max opens the link and pays with PayPal …” (pay) “… and Jabboo Pay tells me.”

Wait for the spoken “Max hat 50 Euro bezahlt” and the green PAID badge.

**1:30–1:55 · Demo 2: English, quantities, due date, payment link**

Say:
> “Send John an invoice for three hours at eighty dollars for consulting, due in fourteen days, Jabboo.”

> “It understands German and English, spoken numbers, quantities and due dates.” (show preview, say “cancel, Jabboo”)

Say:
> “Create a payment link for nineteen euros ninety for the e-book, Jabboo.” → “Confirm, Jabboo.”

> “For people without an invoice there’s a pay-now link from the Orders API. Approved orders are captured automatically.”

**1:55–2:20 · Agents** (screen: terminal or Claude Code with the MCP server, show `tools/list` or one tool call)

> “The same core is an MCP server. Any AI agent – like Claude – can create invoices and payment links as tools, and the user confirms every single call. That’s agentic commerce with a human in the loop.”

**2:20–2:35 · Close** (screen: GitHub repo, MIT badge)

> “Open source under MIT, zero dependencies, 25 tests. Jabboo Pay: say it, get paid. Thanks!”

---

Checklist after upload: video public, under 3:00, link pasted into Devpost “Video demo link”.
