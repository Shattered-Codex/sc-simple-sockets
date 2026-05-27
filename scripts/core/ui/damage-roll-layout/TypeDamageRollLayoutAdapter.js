import { condenseRows } from "./damageRollLayoutDom.js";
import { collectRollEntries } from "./damageRollLayoutData.js";

export class TypeDamageRollLayoutAdapter {
  build({ rows, rolls }) {
    const entries = collectRollEntries(rolls, rows);
    if (!entries) return [];

    const groups = new Map();
    entries.all.forEach((entry) => {
      const key = String(entry.type ?? "unknown");
      const group = groups.get(key) ?? [];
      group.push(entry.row);
      groups.set(key, group);
    });

    return Array.from(groups.values()).flatMap((groupRows) => condenseRows(groupRows));
  }
}
