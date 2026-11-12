# Video script – Jabboo Pay (target 2:40, hard limit 3:00)

Story: **PayPal for everyone who can’t easily type or see.**

Recording: QuickTime → File → New Screen Recording, **with system audio and microphone** (the spoken replies are part of the demo). Upload to YouTube as **Public**, title “Jabboo Pay – PayPal for everyone who can't easily type or see (PayPal AI Hackathon)”. No background music. Narration in English; the German commands are part of the demo.

Prepare before recording:
- `npm start` running, browser at http://localhost:4242, zoom 125 %, “Read aloud” on.
- `contacts.json`: Max → your sandbox personal account e-mail.
- A second browser window for paying as Max (sandbox personal account).
- A photo or printout of a note: “Rechnung an Max Mustermann / max@… / Betreff: Logo-Design / Summe 120 €”.
- Jabboo running in continuous mode. Commands must **not** start with “Hey Jabboo”; end them with “…, Jabboo”.

---

**0:00–0:20 · Hook** (screen: Jabboo Pay page)

> “Sending an invoice means a dozen small fields and buttons. If you have a tremor, arthritis, or you can’t see the screen, that’s a wall. Jabboo Pay is PayPal for everyone who can’t easily type or see.”

**0:20–0:35 · How** (point at the privacy footer)

> “I talk, my Mac listens – speech recognition runs offline in my app Jabboo. Jabboo Pay reads everything back and never acts without my ‘yes’.”

**0:35–1:10 · Demo 1: invoice by voice, hands off the keyboard** (hands visibly off the keyboard)

Say:
> „Schick Max eine PayPal-Rechnung über fünfzig Euro für das Shopware-Plugin, Jabboo.“

Let the reply play: „Rechnung an Max über 50 Euro für Shopware-Plugin. Sag ja zum Erstellen oder abbrechen.“

Say:
> „Ja, Jabboo.“

Reply: „Erledigt. Die Rechnung ist erstellt, der Link ist in der Zwischenablage.“

> “A real invoice in the PayPal Sandbox, created and issued with the Invoicing API. The link is on my clipboard, ready to send.”

**1:10–1:30 · Get paid** (second window: open the link, pay as Max)

> “Max pays with PayPal …” — wait for the spoken „Max hat 50 Euro bezahlt“ and the “✓ Paid” badge.

**1:30–1:50 · Ask instead of looking**

Say:
> “What is still open, Jabboo.”

Let the answer play.
> “I don’t have to read a dashboard. I just ask – Jabboo Pay checks PayPal and answers.”

**1:50–2:10 · Photo to invoice**

Click “📷 Photo to invoice”, choose the photo of the note. Reply reads it back. Say „Ja, Jabboo.“

> “Got a handwritten note or an order? Take a photo. The text is recognised on the Mac, read back, and confirmed by voice.”

**2:10–2:25 · Screen reader and keyboard** (Tab through the page, focus ring visible; optional: VoiceOver on with ⌘F5 for two seconds)

> “Everything works with the keyboard alone and with screen readers: every reply lands in a live region, big targets, high contrast, text up to 200 percent.”

**2:25–2:40 · Agents and close** (show the MCP tools list or the GitHub repo with the MIT license)

> “The same core is an MCP server, so AI agents can bill and check payments too – always with a human yes. Open source under MIT. Jabboo Pay: PayPal for everyone. Thanks!”

---

Checklist after upload: public, under 3:00, link pasted into the Devpost “Video demo link” field.
Fallback if invoicing is not enabled in the Sandbox app: use „Erstelle einen Zahlungslink über 50 Euro für das Shopware-Plugin, Jabboo.“ in Demo 1 (Orders API), the rest stays the same.
