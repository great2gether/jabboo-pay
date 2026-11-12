// Self-playing demo for the video (?demo=1). Narration in English via the browser voice,
// commands typed into the field, the app answers with its own speech. No microphone needed.
(() => {
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = document.createElement("div");
  cap.setAttribute("role", "status");
  cap.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;background:#17112a;color:#fff;font:600 22px/1.4 system-ui;padding:14px 22px;border-radius:14px;z-index:9999;box-shadow:0 8px 30px #0008;text-align:center";
  document.body.append(cap);
  const term = document.createElement("pre");
  term.style.cssText = "position:fixed;inset:8vh 8vw auto 8vw;max-height:70vh;overflow:auto;background:#0b0b10;color:#d6ffd6;font:15px/1.5 ui-monospace,Menlo,monospace;padding:20px;border-radius:12px;z-index:9998;display:none;white-space:pre-wrap";
  document.body.append(term);

  const voice = () => speechSynthesis.getVoices().find((v) => /Samantha/.test(v.name)) || speechSynthesis.getVoices().find((v) => v.lang === "en-US");
  const quiet = async () => { let calm = 0; for (let i = 0; i < 120 && calm < 3; i++) { await sleep(250); calm = speechSynthesis.speaking || speechSynthesis.pending ? 0 : calm + 1; } };
  async function narrate(text) {
    cap.textContent = text;
    await quiet();
    await new Promise((res) => { const u = new SpeechSynthesisUtterance(text); u.voice = voice(); u.lang = "en-US"; u.rate = 1; u.onend = res; u.onerror = res; speechSynthesis.speak(u); });
    await sleep(300);
  }
  async function type(text) {
    const t = $("cmd");
    t.scrollIntoView({ behavior: "smooth", block: "center" });
    t.focus(); t.value = "";
    for (const ch of text) { t.value += ch; await sleep(28); }
    await sleep(500);
    t.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await sleep(900);
    await quiet();
    await sleep(500);
  }
  const show = (id) => $(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function run() {
    document.documentElement.style.setProperty("--scale", 1.1);
    await narrate("Sending an invoice means a dozen small fields and buttons. With a tremor, or without sight, that is a wall. This is PayPal for everyone who can't easily type or see.");
    await narrate("Speech is recognised offline on the Mac. For this recording, the commands are typed in. One sentence:");
    await type("Schick Max eine PayPal-Rechnung über 50 Euro für das Shopware-Plugin");
    await narrate("It reads everything back and waits for my yes.");
    await type("Ja");
    await narrate("A real invoice in the PayPal Sandbox, created with the Invoicing API. The payer link is on the clipboard.");
    await narrate("Now a voice search in an accessible AG Grid.");
    await type("Zeig mir alle offenen Rechnungen über 100 Euro aus diesem Monat");
    show("grid-h");
    await sleep(800);
    await type("Nächste Zeile");
    await narrate("The sentence became a real AG Grid filter over all PayPal invoices, links and transactions, and the result is read aloud.");
    await type("Was wird diese Woche fällig?");
    show("grid-h");
    await narrate("Due dates are read aloud, and shown in a Bryntum calendar.");
    await type("Prüfe das Protokoll");
    show("grid-h");
    await narrate("Every step is notarised: what was heard, what was read back, how it was confirmed, and what PayPal answered. Each line is chained with SHA-256, so any change is detected.");
    await narrate("A photo of a note works too. Text recognition runs on the Mac.");
    try {
      const img = await (await fetch("/demo-note.jpg")).blob();
      const pic = document.createElement("img"); pic.src = URL.createObjectURL(img);
      pic.style.cssText = "position:fixed;right:4vw;top:12vh;width:30vw;border-radius:12px;box-shadow:0 8px 30px #0008;z-index:9997";
      document.body.append(pic);
      $("cmd").scrollIntoView({ behavior: "smooth", block: "center" });
      const r = await (await fetch("/api/photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: img })).json();
      window.__jabbooDemoPhoto?.(r);
      await sleep(900); await quiet();
      pic.remove();
      await type("Abbrechen");
    } catch {}
    await narrate("And AI agents use the same core through MCP.");
    term.style.display = "block"; term.textContent = "";
    const line = async (t, ms = 15) => { for (const ch of t) { term.textContent += ch; if (ms) await sleep(ms); } term.textContent += "\n"; };
    await line("$ MCP client → jabboo-pay (stdio)");
    await line('→ {"method":"tools/call","params":{"name":"create_paypal_payment_link","arguments":{"amount":30,"currency":"EUR","description":"Accessibility workshop"}}}', 6);
    await line("\n⚠  Human confirmation required: create a PayPal payment link for 30.00 EUR “Accessibility workshop”?  [Allow] [Deny]");
    await sleep(1800);
    await line("✓  Allowed by the user");
    try {
      const res = await (await fetch("/api/demo/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
      await line("← " + JSON.stringify(res.response).slice(0, 400), 3);
    } catch (e) { await line("← (offline)"); }
    await narrate("Claude can bill and check payments, but a human always confirms, and the audit chain records it.");
    term.style.display = "none";
    await narrate("Voice, an accessible grid, a calendar, an audit chain and an AI agent, on PayPal. Open source under MIT, at github dot com slash great2gether slash jabboo-pay.");
    cap.textContent = "github.com/great2gether/jabboo-pay · MIT";
  }

  const start = document.createElement("button");
  start.textContent = "▶ Start demo";
  start.style.cssText = "position:fixed;inset:40vh auto auto 50%;transform:translateX(-50%);font:700 28px system-ui;padding:20px 40px;border-radius:16px;background:#5a2ee0;color:#fff;border:0;z-index:10000;cursor:pointer";
  start.onclick = () => { start.remove(); run(); };
  document.body.append(start);
  start.focus();
})();
