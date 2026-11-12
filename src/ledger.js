// Local list of what Jabboo Pay created, so you can ask "has Max paid?".
// Stays on this Mac (data/ledger.json, git-ignored). PayPal stays the source of truth for status.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

export function createLedger(file) {
  let rows = [];
  let loadedAt = 0;
  // Re-read when another process (CLI, MCP) wrote the file.
  const load = () => {
    if (!file || !existsSync(file)) return;
    const m = statSync(file).mtimeMs;
    if (m === loadedAt) return;
    try {
      rows = JSON.parse(readFileSync(file, "utf8"));
      loadedAt = m;
    } catch {}
  };
  load();
  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(rows, null, 2), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
    loadedAt = statSync(file).mtimeMs;
  };
  return {
    add(row) {
      load();
      rows = rows.filter((r) => r.id !== row.id);
      rows.unshift({ ...row, createdAt: row.createdAt || new Date().toISOString() });
      save();
    },
    update(id, patch) {
      load();
      const r = rows.find((x) => x.id === id);
      if (r) {
        Object.assign(r, patch);
        save();
      }
    },
    list: () => (load(), rows.slice()),
  };
}
