// Spoken number words -> digits, German and English.
// Speech engines usually write digits, but not always ("fünfzig Euro").

const DE_UNITS = {
  null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12,
  dreizehn: 13, vierzehn: 14, fünfzehn: 15, fuenfzehn: 15, sechzehn: 16, siebzehn: 17,
  achtzehn: 18, neunzehn: 19,
};
const DE_TENS = {
  zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, fuenfzig: 50,
  sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
};

const EN_SMALL = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const EN_SCALE = { hundred: 100, thousand: 1000 };

// One German word such as "zweitausendfünfhundertneunundneunzig". null if not a number.
export function parseGermanNumberWord(word) {
  const w = word.toLowerCase();
  if (!w) return null;
  const t = w.indexOf("tausend");
  if (t >= 0) {
    const head = w.slice(0, t);
    const tail = w.slice(t + 7);
    const h = head === "" ? 1 : parseGermanNumberWord(head);
    const r = tail === "" ? 0 : parseGermanNumberWord(tail.replace(/^und/, ""));
    return h == null || r == null ? null : h * 1000 + r;
  }
  const hu = w.indexOf("hundert");
  if (hu >= 0) {
    const head = w.slice(0, hu);
    const tail = w.slice(hu + 7);
    const h = head === "" ? 1 : parseGermanNumberWord(head);
    const r = tail === "" ? 0 : parseGermanNumberWord(tail.replace(/^und/, ""));
    return h == null || r == null || h > 9 ? null : h * 100 + r;
  }
  if (w in DE_UNITS) return DE_UNITS[w];
  if (w in DE_TENS) return DE_TENS[w];
  const und = w.indexOf("und");
  if (und > 0) {
    const u = DE_UNITS[w.slice(0, und)];
    const ten = DE_TENS[w.slice(und + 3)];
    if (u != null && u < 10 && ten != null) return ten + u;
  }
  return null;
}

// Words that are only numbers when they stand next to another number word.
const WEAK = new Set(["ein", "eine", "einen", "einem", "einer", "one", "a", "an"]);
const JOINERS = new Set(["and", "und"]);

function wordValue(word) {
  const w = word.toLowerCase();
  if (WEAK.has(w) && w !== "ein" && w !== "eine" && w !== "one") return null;
  const de = parseGermanNumberWord(w);
  if (de != null) return de;
  const en = w.split("-").map((p) => EN_SMALL[p]);
  if (en.every((v) => v != null)) return en.reduce((a, b) => a + b, 0);
  return null;
}

// Replace runs of number words with digits: "fifty euros" -> "50 euros",
// "two thousand five hundred" -> "2500", "fünf hundert" -> "500".
// "eine Rechnung" stays as it is.
export function wordsToDigits(text) {
  const tokens = text.split(/(\s+)/);
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^\s+$/.test(tok) || tok === "") {
      out.push(tok);
      i++;
      continue;
    }
    // Strip surrounding punctuation for matching, keep it for output.
    const m = tok.match(/^([^\p{L}\p{N}]*)([\p{L}-]+)([^\p{L}\p{N}]*)$/u);
    const core = m ? m[2] : null;
    const isScale = (w) => w && (w.toLowerCase() in EN_SCALE || /^(hundert|tausend)$/i.test(w));
    const startVal = core ? wordValue(core) : null;
    if (core && (startVal != null || isScale(core))) {
      // Collect a run.
      let total = 0;
      let current = 0;
      let j = i;
      let lastCoreIdx = -1;
      let trailing = "";
      const lead = m[1];
      let used = 0;
      while (j < tokens.length) {
        const t = tokens[j];
        if (/^\s+$/.test(t)) { j++; continue; }
        const mm = t.match(/^([^\p{L}\p{N}]*)([\p{L}-]+)([^\p{L}\p{N}]*)$/u);
        if (!mm || (j !== i && mm[1])) break;
        const w = mm[2].toLowerCase();
        if (JOINERS.has(w) && used > 0) {
          // "one hundred and twenty": only a joiner if a number follows.
          const next = tokens.slice(j + 1).find((x) => !/^\s+$/.test(x));
          const nm = next && next.match(/^([\p{L}-]+)/u);
          if (!nm || wordValue(nm[1]) == null) break;
          j++;
          continue;
        }
        if (w in EN_SCALE || w === "hundert" || w === "tausend") {
          const scale = w === "hundert" ? 100 : w === "tausend" ? 1000 : EN_SCALE[w];
          if (scale === 100) current = (current || 1) * 100;
          else { total += (current || 1) * scale; current = 0; }
        } else {
          const v = wordValue(w);
          if (v == null) break;
          // A weak word ("ein", "one") only counts if a scale word follows it.
          if (WEAK.has(w)) {
            const next = tokens.slice(j + 1).find((x) => !/^\s+$/.test(x));
            const nw = next && next.replace(/[^\p{L}]/gu, "").toLowerCase();
            if (used > 0 || !(nw in EN_SCALE || nw === "hundert" || nw === "tausend")) break;
          }
          if (v >= 1000) { total += current + v; current = 0; } else current += v;
        }
        used++;
        lastCoreIdx = j;
        trailing = mm[3];
        j++;
        if (trailing) break;
      }
      if (used > 0) {
        out.push(lead + String(total + current) + trailing);
        i = lastCoreIdx + 1;
        continue;
      }
    }
    out.push(tok);
    i++;
  }
  return out.join("");
}
