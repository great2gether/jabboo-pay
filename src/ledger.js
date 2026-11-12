// Local list of what Jabboo Pay created, so you can ask "has Max paid?".
// Stays on this Mac (data/ledger.json, git-ignored). PayPal stays the source of truth for status.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export function createLedger(file) {
  let rows = [];
  if (file && existsSync(file)) {
    try {
      rows = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      rows = [];
    }
  }
  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(rows, null, 2), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  return {
    add(row) {
      rows = rows.filter((r) => r.id !== row.id);
      rows.unshift({ ...row, createdAt: row.createdAt || new Date().toISOString() });
      save();
    },
    update(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (r) {
        Object.assign(r, patch);
        save();
      }
    },
    list: () => rows.slice(),
  };
}
