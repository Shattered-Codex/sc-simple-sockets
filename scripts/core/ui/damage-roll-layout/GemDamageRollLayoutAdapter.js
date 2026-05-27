import { Constants } from "../../Constants.js";
import { buildGemBox } from "./damageRollLayoutDom.js";
import { buildGemInstanceKey, collectRollEntries } from "./damageRollLayoutData.js";

export class GemDamageRollLayoutAdapter {
  build({ rows, rolls }) {
    const entries = collectRollEntries(rolls, rows);
    if (!entries) return [];

    const rendered = [...entries.base.map((entry) => entry.row)];
    const groups = new Map();

    entries.gems.forEach((entry) => {
      const key = buildGemInstanceKey(entry.meta, entry);
      const group = groups.get(key) ?? {
        meta: entry.meta,
        rows: []
      };
      group.rows.push(entry.row);
      groups.set(key, group);
    });

    groups.forEach((group) => {
      const title = group.meta?.gemName
        ?? Constants.localize("SCSockets.GemDetails.ExtraDamage.Label", "Gem");
      const box = buildGemBox({
        title,
        imageSrc: group.meta?.gemImg ?? Constants.SOCKET_SLOT_IMG,
        rows: group.rows
      });
      if (box) {
        rendered.push(box);
      }
    });

    return rendered;
  }
}
