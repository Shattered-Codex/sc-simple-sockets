import { Constants } from "../../Constants.js";
import { buildGemBox, condenseEntriesByType } from "./damageRollLayoutDom.js";
import { buildGemTypeKey, collectRollEntries } from "./damageRollLayoutData.js";

export class GemTypeDamageRollLayoutAdapter {
  build({ rows, rolls }) {
    const entries = collectRollEntries(rolls, rows);
    if (!entries) return [];

    const rendered = [...entries.base.map((entry) => entry.row)];
    const groups = new Map();

    entries.gems.forEach((entry) => {
      const key = buildGemTypeKey(entry.meta);
      const group = groups.get(key) ?? {
        meta: entry.meta,
        count: 0,
        entries: []
      };
      group.count += 1;
      group.entries.push(entry);
      groups.set(key, group);
    });

    groups.forEach((group) => {
      const name = group.meta?.gemName
        ?? Constants.localize("SCSockets.GemDetails.ExtraDamage.Label", "Gem");
      const title = group.count > 1 ? `${group.count}x ${name}` : name;
      const box = buildGemBox({
        title,
        imageSrc: group.meta?.gemImg ?? Constants.SOCKET_SLOT_IMG,
        rows: condenseEntriesByType(group.entries)
      });
      if (box) {
        rendered.push(box);
      }
    });

    return rendered;
  }
}
