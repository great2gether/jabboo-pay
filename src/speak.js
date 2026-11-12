// Read answers aloud on macOS with the built-in `say` (offline system voices).
// Off with JABBOO_PAY_SPEAK=0 or --quiet. No shell, text goes in as an argument.

import { execFileSync, spawn } from "node:child_process";

let voices = null;
function pickVoice(language, env) {
  const override = language === "de" ? env.JABBOO_PAY_VOICE_DE : env.JABBOO_PAY_VOICE_EN;
  if (override) return override;
  if (voices === null) {
    try {
      voices = execFileSync("say", ["-v", "?"], { encoding: "utf8" })
        .split("\n")
        .map((l) => l.match(/^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})/))
        .filter(Boolean)
        .map((m) => ({ name: m[1].trim(), locale: m[2] }));
    } catch {
      voices = [];
    }
  }
  const want = language === "de" ? ["de_DE"] : ["en_US", "en_GB"];
  const prefer = language === "de" ? ["Helena", "Anna"] : ["Samantha", "Ava", "Alex"];
  const candidates = voices.filter((v) => want.includes(v.locale));
  return (prefer.map((p) => candidates.find((v) => v.name.startsWith(p))).find(Boolean) || candidates[0])?.name;
}

export function createSpeaker({ env = process.env, enabled = env.JABBOO_PAY_SPEAK !== "0" && process.platform === "darwin" } = {}) {
  let current = null;
  return {
    enabled,
    say(text, language = "en") {
      if (!enabled || !text) return Promise.resolve();
      if (current) current.kill();
      const voice = pickVoice(language, env);
      const args = voice ? ["-v", voice, text] : [text];
      return new Promise((resolve) => {
        current = spawn("say", args, { stdio: "ignore" });
        current.on("exit", () => resolve());
        current.on("error", () => resolve());
      });
    },
  };
}
