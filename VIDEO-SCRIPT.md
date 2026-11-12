# Video script – Jabboo Pay (target 2:45, hard limit 3:00)

Red thread: **A blind user runs PayPal by voice – speaks, hears every step, searches in an accessible AG Grid by voice, every step notarised in a tamper-evident audit chain – and Claude can do the same via MCP, but a human always confirms.**

Recording: QuickTime → File → New Screen Recording **with system audio and microphone** (the spoken replies are part of the demo). YouTube: **Public**, title “Jabboo Pay – PayPal for everyone who can't easily type or see”. No music. Narration in English, German commands are part of the demo.

Prepare:
- `npm start` running; browser at http://localhost:4242, zoom 125 %, “Read aloud” on.
- `contacts.json`: Max → your sandbox personal account e-mail. A few links/invoices already exist (they do).
- Second window for paying as Max (sandbox personal account), or skip the payment and show “open” status.
- Claude Code open in the `jabboo-pay` folder (MCP server loads from `.mcp.json`; check with `/mcp`).
- Jabboo in continuous mode. Commands must **not** start with “Hey Jabboo”; end them with “…, Jabboo”.

---

**0:00–0:15 · Hook** (Jabboo Pay page)
> “Sending an invoice means a dozen small fields. If you have a tremor, or you can’t see the screen, that’s a wall. This is Jabboo Pay: PayPal for everyone who can’t easily type or see.”

**0:15–0:50 · Speak, hear, confirm** (hands visibly off the keyboard)
Say: „Schick Max eine PayPal-Rechnung über fünfzig Euro für das Shopware-Plugin, Jabboo.“
→ reply plays: „Rechnung an Max über 50 Euro für Shopware-Plugin. Sag ja zum Erstellen oder abbrechen.“
Say: „Ja, Jabboo.“ → „Erledigt …“
> “My voice is recognised offline on my Mac. Jabboo Pay reads every step back and acts only on my yes. That was a real invoice in the PayPal Sandbox – Invoicing API.”
(If invoicing is not enabled: „Erstelle einen Zahlungslink über 50 Euro für das Shopware-Plugin, Jabboo.“ – Orders API.)

**0:50–1:25 · Search by voice in AG Grid**
Say: „Zeig mir alle offenen Zahlungslinks über 100 Euro aus diesem Monat, Jabboo.“
→ grid filters itself, reply: „2 offene Zahlungslinks, zusammen 370 Euro …“
Say: „Nächste Zeile, Jabboo.“ → row is read aloud. Say „Nächste Zeile“ once more.
> “The sentence becomes a real AG Grid filter over all my PayPal invoices, links and transactions – and the result is read to me. AG Grid is configured for screen readers; I never have to look.”

**1:25–1:50 · Ask**
Say: „Hat Max bezahlt, Jabboo?“ / „Was ist noch offen, Jabboo?“
> “Fresh status straight from PayPal, as an answer, not a dashboard.”

**1:45–1:55 · Due dates** (optional, if time allows)
Say: „Was wird diesen Monat fällig, Jabboo?“ → answer plays, the “Due dates” tab opens the Bryntum Calendar.
> “And I hear what is due – the calendar follows my question.”

**1:55–2:15 · Proof: the audit chain** (open the “Audit log” tab)
Say: „Prüfe das Protokoll, Jabboo.“ → „Das Protokoll ist unverändert …“
> “Every step is notarised: what I said, what was read back, how I confirmed, what PayPal answered – each line chained with SHA-256. If anyone ever says ‘I never said that’, this proves it. Accountability for assisted payments.”

**2:15–2:40 · Claude does it too – a human confirms** (switch to Claude Code)
Type or dictate to Claude: “Create a PayPal payment link for 30 euros for the accessibility workshop, then tell me what is still open.”
→ Claude calls `create_paypal_payment_link` – the approval prompt appears – approve – Claude calls `ask_payment_question` and answers.
Back in the browser: the new link is in the grid, the audit log says “confirmed via MCP approval”.
> “Same core as an MCP server. Claude can bill and check payments – but a human always says yes, and the audit chain records it.”

**2:40–2:50 · Close** (GitHub repo, MIT)
> “Voice, an accessible AG Grid, an audit chain and an AI agent – on PayPal. Open source under MIT. Jabboo Pay: PayPal for everyone.”

---

After upload: public, under 3:00, link into Devpost “Video demo link”, sponsor tool **AG Grid** selected.
