import { Constants } from "../../Constants.js";
import { appendBadges, condenseRows } from "./damageRollLayoutDom.js";
import { collectRollEntries } from "./damageRollLayoutData.js";

export class TypeBadgesDamageRollLayoutAdapter {
  build({ app, rows, rolls }) {
    const entries = collectRollEntries(rolls, rows);
    if (!entries) return [];

    const sourceItem = app?.item ?? app?.object?.item ?? app?.subject?.item ?? app?.object ?? null;
    const groups = new Map();

    entries.all.forEach((entry) => {
      const key = String(entry.type ?? "unknown");
      const group = groups.get(key) ?? {
        rows: [],
        badges: new Map()
      };

      group.rows.push(entry.row);

      if (entry.meta) {
        this.#addGemBadge(group.badges, entry.meta);
      } else {
        this.#addItemBadge(group.badges, sourceItem);
      }

      groups.set(key, group);
    });

    const rendered = [];
    groups.forEach((group) => {
      const condensed = condenseRows(group.rows);
      const badges = Array.from(group.badges.values())
        .sort((left, right) => (
          Number(left?.priority ?? 99) - Number(right?.priority ?? 99)
          || String(left?.label ?? "").localeCompare(String(right?.label ?? ""), game?.i18n?.lang ?? undefined)
        ));
      condensed.forEach((row) => {
        appendBadges(row, badges, { hideStaticLabel: true });
        rendered.push(row);
      });
    });

    return rendered;
  }

  #addGemBadge(badgeMap, meta) {
    const name = String(meta?.gemName ?? "").trim()
      || Constants.localize("SCSockets.GemDetails.ExtraDamage.Label", "Gem");
    const img = String(meta?.gemImg ?? "").trim() || Constants.SOCKET_SLOT_IMG;
    const key = `gem:${img}:${name}`;
    const current = badgeMap.get(key) ?? { label: name, img, count: 0, priority: 1 };
    current.count += 1;
    badgeMap.set(key, current);
  }

  #addItemBadge(badgeMap, item) {
    const name = String(item?.name ?? "").trim();
    if (!name.length) {
      return;
    }

    const img = String(item?.img ?? "").trim() || Constants.SOCKET_SLOT_IMG;
    const key = `item:${item?.uuid ?? item?.id ?? img}:${name}`;
    if (badgeMap.has(key)) {
      return;
    }

    badgeMap.set(key, {
      label: name,
      img,
      count: 1,
      priority: 0
    });
  }
}
