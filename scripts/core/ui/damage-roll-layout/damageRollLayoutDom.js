import { Constants } from "../../Constants.js";

export function rootOf(html) {
  if (!html) return null;
  if (html.jquery || typeof html.get === "function") {
    return html[0] ?? html.get(0) ?? null;
  }
  if (html instanceof Element || html?.querySelector) {
    return html;
  }
  return null;
}

export function condenseRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  const [first, ...rest] = rows;
  const combinedFormula = rows
    .map((row) => row.querySelector(".formula")?.textContent?.trim())
    .filter(Boolean)
    .join(" + ");

  const formulaElement = first.querySelector(".formula");
  if (formulaElement && combinedFormula) {
    formulaElement.textContent = combinedFormula;
  }

  rest.forEach((row) => row.remove());
  return [first];
}

export function condenseEntriesByType(entries) {
  if (!Array.isArray(entries) || !entries.length) return [];

  const groups = new Map();
  for (const entry of entries) {
    const key = String(entry?.type ?? "unknown");
    const group = groups.get(key) ?? [];
    group.push(entry.row);
    groups.set(key, group);
  }

  return Array.from(groups.values()).flatMap((rows) => condenseRows(rows));
}

export function buildGemBox({ title, imageSrc, rows }) {
  if (!Array.isArray(rows) || !rows.length) return null;

  const box = document.createElement("li");
  box.className = "sc-sockets-gem-box";

  const fieldset = document.createElement("fieldset");
  fieldset.className = "sc-sockets-gem-fieldset";

  const legend = document.createElement("legend");
  legend.className = "sc-sockets-gem-legend";
  legend.innerHTML = `
    <img src="${imageSrc ?? Constants.SOCKET_SLOT_IMG}" alt="${title}" class="sc-sockets-gem-box__img">
    <span class="sc-sockets-gem-box__title">${title}</span>
  `;
  fieldset.appendChild(legend);

  const content = document.createElement("div");
  content.className = "sc-sockets-gem-box__content";

  rows.forEach((row) => {
    const container = document.createElement("div");
    container.className = "sc-sockets-gem-box__row";

    while (row.firstChild) {
      container.appendChild(row.firstChild);
    }

    content.appendChild(container);
  });

  fieldset.appendChild(content);
  box.appendChild(fieldset);
  return box;
}

export function appendBadges(row, badges, { hideStaticLabel = false } = {}) {
  if (!(row instanceof HTMLElement) || !Array.isArray(badges) || !badges.length) {
    return row;
  }

  const line = row.querySelector(".formula-line");
  if (!(line instanceof HTMLElement)) {
    return row;
  }

  line.querySelectorAll(".sc-sockets-gem-roll-badges").forEach((element) => element.remove());
  const label = line.querySelector(".label");
  let side = line.querySelector(".sc-sockets-gem-roll-side");

  if (!(side instanceof HTMLElement)) {
    side = document.createElement("div");
    side.className = "sc-sockets-gem-roll-side";

    if (label instanceof HTMLElement) {
      line.insertBefore(side, label);
      side.append(label);
    } else {
      line.append(side);
    }
  }

  if (hideStaticLabel && label instanceof HTMLElement) {
    const hasInteractiveControl = Boolean(label.querySelector("select, multi-select, input, button"));
    if (!hasInteractiveControl) {
      label.remove();
    }
  }

  const wrapper = document.createElement("div");
  wrapper.className = "sc-sockets-gem-roll-badges sc-sockets-badges sc-sockets-badges-inline";

  badges.forEach((badgeData) => {
    const badge = document.createElement("span");
    badge.className = "gem sc-sockets-gem-roll-badge";

    const label = buildBadgeLabel(badgeData);
    if (label) {
      badge.dataset.tooltip = label;
      badge.dataset.tooltipDirection = "LEFT";
      badge.title = label;
    }

    const image = document.createElement("img");
    image.src = String(badgeData?.img ?? "").trim() || Constants.SOCKET_SLOT_IMG;
    image.alt = label;
    image.draggable = false;
    badge.append(image);

    if (Number(badgeData?.count ?? 1) > 1) {
      const count = document.createElement("span");
      count.className = "sc-sockets-gem-roll-badge-count";
      count.textContent = `${Number(badgeData.count)}x`;
      badge.append(count);
    }

    wrapper.append(badge);
  });

  side.insertBefore(wrapper, side.firstChild ?? null);
  return row;
}

function buildBadgeLabel(badgeData) {
  const name = String(badgeData?.label ?? "").trim();
  const count = Number(badgeData?.count ?? 1);

  if (!name.length) {
    return "";
  }

  return count > 1 ? `${count}x ${name}` : name;
}
