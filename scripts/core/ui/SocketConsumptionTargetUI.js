import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { SocketConsumptionHostService } from "../services/SocketConsumptionHostService.js";
import {
  CONSUMPTION_TYPE_CHARGE,
  CONSUMPTION_TYPE_GEM,
  SOCKET_CONSUMPTION_SCOPES,
  SOCKET_CONSUMPTION_SELECTOR_MODES,
  formatSocketTarget,
  getActivitySourceSlotIndex,
  getSocketConsumptionScope,
  parseSocketTarget
} from "../helpers/socketConsumptionConfig.js";

/**
 * Renders friendly "From" + value fields inside the native consumption rows of the
 * activity sheet for the module's consumption types. The fields are freely
 * configurable — the resource key or gem does not need to be socketed yet — and are
 * composed into the target grammar string submitted through a hidden input named
 * `consumption.targets.<index>.target`, so the native schema remains the storage.
 */
export class SocketConsumptionTargetUI {
  static #handler = null;
  static FIELD_CLASS = "sc-sockets-consumption-target";

  static activate() {
    if (SocketConsumptionTargetUI.#handler) {
      return;
    }
    SocketConsumptionTargetUI.#handler = (sheet, html) => {
      try {
        SocketConsumptionTargetUI.bindToSheet(sheet, html);
      } catch (error) {
        console.error(`[${Constants.MODULE_ID}] failed to render socket consumption target fields:`, error);
      }
    };
    Hooks.on("renderActivitySheet", SocketConsumptionTargetUI.#handler);
  }

  static deactivate() {
    if (!SocketConsumptionTargetUI.#handler) {
      return;
    }
    Hooks.off("renderActivitySheet", SocketConsumptionTargetUI.#handler);
    SocketConsumptionTargetUI.#handler = null;
  }

  static bindToSheet(sheet, html) {
    const activity = sheet?.activity;
    if (!activity) {
      return;
    }

    const root = SocketConsumptionTargetUI.#rootOf(html ?? sheet?.element);
    if (!root) {
      return;
    }

    const rows = root.querySelectorAll('.tab[data-tab="consumption"] .form-group[data-index]');
    for (const row of rows) {
      SocketConsumptionTargetUI.#bindRow(row, sheet, activity);
    }
  }

  static #bindRow(row, sheet, activity) {
    const index = Number(row.dataset.index);
    if (!Number.isInteger(index)) {
      return;
    }

    const typeSelect = row.querySelector(`select[name="consumption.targets.${index}.type"]`);
    const type = typeSelect?.value ?? "";
    const isCharge = type === CONSUMPTION_TYPE_CHARGE;
    if (!isCharge && type !== CONSUMPTION_TYPE_GEM) {
      return;
    }
    if (row.querySelector(`.${SocketConsumptionTargetUI.FIELD_CLASS}`)) {
      return;
    }

    const editable = sheet?.isEditable !== false;
    const stored = String(activity.consumption?.targets?.[index]?.target ?? "");
    const spec = parseSocketTarget(stored);
    const allowSourceSlot = GemCriteria.matches(activity.item)
      || getActivitySourceSlotIndex(activity) !== null;
    const modes = SocketConsumptionTargetUI.#availableModes(isCharge, allowSourceSlot);
    const mode = spec?.mode && modes.includes(spec.mode) ? spec.mode : modes[0];

    const group = document.createElement("div");
    group.className = `field-group ${SocketConsumptionTargetUI.FIELD_CLASS}`;
    const fromHint = Constants.localize(
      isCharge
        ? "SCSockets.Consumption.FromHintCharge"
        : "SCSockets.Consumption.FromHintGem",
      isCharge
        ? "Item recovery does not automatically restore socketed charges."
        : "Item recovery does not automatically restore consumed socketed gems."
    );

    group.innerHTML = SocketConsumptionTargetUI.#buildFieldsHtml({
      index,
      stored,
      spec,
      mode,
      modes,
      editable,
      fromHint
    });

    const anchor = typeSelect?.closest(".field-group");
    if (anchor) {
      anchor.insertAdjacentElement("afterend", group);
    } else {
      row.querySelector(".form-fields")?.appendChild(group);
    }

    if (editable) {
      SocketConsumptionTargetUI.#bindEvents(group);
    }
  }

  static #availableModes(isCharge, allowSourceSlot) {
    const modes = [];
    if (allowSourceSlot) {
      modes.push(SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT);
    }
    if (isCharge) {
      modes.push(SOCKET_CONSUMPTION_SELECTOR_MODES.ANY);
    }
    modes.push(
      SOCKET_CONSUMPTION_SELECTOR_MODES.ANY_GEM,
      SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME,
      SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH,
      SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT
    );
    return modes;
  }

  static #buildFieldsHtml({ index, stored, spec, mode, modes, editable, fromHint }) {
    const disabled = editable ? "" : " disabled";
    const escape = SocketConsumptionTargetUI.#escapeHtml;
    const valueMeta = SocketConsumptionTargetUI.#valueMeta(mode);
    const currentValue = SocketConsumptionTargetUI.#specValue(spec, mode);
    const scope = spec
      ? getSocketConsumptionScope(spec)
      : (SocketConsumptionTargetUI.#isLocalOnlyMode(mode)
        ? SOCKET_CONSUMPTION_SCOPES.ITEM
        : SOCKET_CONSUMPTION_SCOPES.ACTOR_EQUIPPED);

    const modeOptions = modes.map((option) => {
      const label = Constants.localize(`SCSockets.Consumption.Mode.${option}`, option);
      return `<option value="${escape(option)}"${option === mode ? " selected" : ""}>${escape(label)}</option>`;
    }).join("");
    const scopeOptions = Object.values(SOCKET_CONSUMPTION_SCOPES).map((option) => {
      const label = Constants.localize(`SCSockets.Consumption.Scope.${option}`, option);
      return `<option value="${escape(option)}"${option === scope ? " selected" : ""}>${escape(label)}</option>`;
    }).join("");
    const localOnly = SocketConsumptionTargetUI.#isLocalOnlyMode(mode);
    const filterHint = Constants.localize(
      "SCSockets.Consumption.Filter.Hint",
      "Optional. Only host items for which this condition returns true contribute to the pool."
    );

    return `
      <div class="form-group label-top">
        <label class="sc-sockets-consumption-target-label">
          <span>${escape(Constants.localize("SCSockets.Consumption.FromLabel", "From"))}</span>
          <i class="fa-solid fa-circle-info"
             data-tooltip="${escape(fromHint)}"
             aria-label="${escape(fromHint)}"></i>
        </label>
        <div class="form-fields">
          <select data-sc-sockets-field="mode"${disabled}>${modeOptions}</select>
        </div>
      </div>
      <div class="form-group label-top sc-sockets-consumption-scope${localOnly ? " hidden" : ""}">
        <label>${escape(Constants.localize("SCSockets.Consumption.ScopeLabel", "Pool scope"))}</label>
        <div class="form-fields">
          <select data-sc-sockets-field="scope"${disabled}>${scopeOptions}</select>
        </div>
      </div>
      <div class="form-group label-top sc-sockets-consumption-target-value${valueMeta.hidden ? " hidden" : ""}">
        <label>${escape(valueMeta.label)}</label>
        <div class="form-fields">
          <input type="${valueMeta.inputType}" data-sc-sockets-field="value"
                 value="${escape(currentValue)}" placeholder="${escape(valueMeta.placeholder)}"
                 ${valueMeta.inputType === "number" ? 'min="0" step="1"' : ""}${disabled}>
        </div>
      </div>
      <div class="form-group label-top sc-sockets-consumption-filter">
        <label class="sc-sockets-consumption-filter-label">
          <span>${escape(Constants.localize("SCSockets.Consumption.Filter.Label", "Host item filter"))}</span>
          <i class="fa-solid fa-circle-info"
             data-tooltip="${escape(filterHint)}"
             aria-label="${escape(filterHint)}"></i>
        </label>
        <div class="form-fields">
          <textarea rows="3" data-sc-sockets-field="filter"
                    placeholder="${escape(Constants.localize("SCSockets.Consumption.Filter.Placeholder", "Optional JavaScript condition"))}"${disabled}>${escape(spec?.filter ?? "")}</textarea>
        </div>
      </div>
      <input type="hidden" name="consumption.targets.${index}.target" value="${escape(stored)}">
    `;
  }

  static #valueMeta(mode) {
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY) {
      return {
        hidden: false,
        inputType: "text",
        label: Constants.localize("SCSockets.Consumption.Value.Resource", "Resource Key"),
        placeholder: Constants.localize("SCSockets.Consumption.Value.ResourcePlaceholder", "e.g. battery")
      };
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME) {
      return {
        hidden: false,
        inputType: "text",
        label: Constants.localize("SCSockets.Consumption.Value.GemName", "Gem Name"),
        placeholder: Constants.localize("SCSockets.Consumption.Value.GemNamePlaceholder", "e.g. Battery Gem")
      };
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH) {
      return {
        hidden: false,
        inputType: "text",
        label: Constants.localize("SCSockets.Consumption.Value.NamePattern", "Name Pattern"),
        placeholder: Constants.localize("SCSockets.Consumption.Value.NamePatternPlaceholder", "e.g. Fire* or Battery")
      };
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT) {
      return {
        hidden: false,
        inputType: "number",
        label: Constants.localize("SCSockets.Consumption.Value.Slot", "Slot Number"),
        placeholder: "1"
      };
    }
    return { hidden: true, inputType: "text", label: "", placeholder: "" };
  }

  static #specValue(spec, mode) {
    if (!spec || spec.mode !== mode) {
      return "";
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY) {
      return spec.resourceKey ?? "";
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME) {
      return spec.gemName ?? "";
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH) {
      return spec.gemNamePattern ?? "";
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT) {
      // Displayed 1-based for users; stored 0-based in the grammar.
      return Number.isInteger(spec.slotIndex) ? String(spec.slotIndex + 1) : "";
    }
    return "";
  }

  static #bindEvents(group) {
    group.addEventListener("change", (event) => {
      const field = event.target instanceof HTMLElement ? event.target.dataset.scSocketsField : null;
      if (!field) {
        return;
      }
      event.stopPropagation();

      if (field === "mode") {
        // Adjust the value field in place; only persist once the target is complete,
        // otherwise the sheet re-render would reset the mode the user just picked.
        SocketConsumptionTargetUI.#applyModeMeta(group);
        SocketConsumptionTargetUI.#syncTarget(group, { onlyWhenComplete: true });
        return;
      }

      if (field === "filter" && event.target instanceof HTMLTextAreaElement) {
        const validation = SocketConsumptionHostService.validateFilter(event.target.value);
        const message = validation.valid ? "" : Constants.localize(
          "SCSockets.Consumption.Filter.Invalid",
          "The host item filter contains invalid JavaScript."
        );
        event.target.setCustomValidity(message);
        if (!validation.valid) {
          event.target.reportValidity();
          return;
        }
      }

      SocketConsumptionTargetUI.#syncTarget(group);
    });
  }

  static #applyModeMeta(group) {
    const modeSelect = group.querySelector('[data-sc-sockets-field="mode"]');
    const valueGroup = group.querySelector(".sc-sockets-consumption-target-value");
    const valueInput = group.querySelector('[data-sc-sockets-field="value"]');
    const scopeGroup = group.querySelector(".sc-sockets-consumption-scope");
    const scopeSelect = group.querySelector('[data-sc-sockets-field="scope"]');
    if (!(modeSelect instanceof HTMLSelectElement) || !(valueGroup instanceof HTMLElement)) {
      return;
    }

    const meta = SocketConsumptionTargetUI.#valueMeta(modeSelect.value);
    valueGroup.classList.toggle("hidden", meta.hidden);
    const label = valueGroup.querySelector("label");
    if (label) {
      label.textContent = meta.label;
    }
    if (valueInput instanceof HTMLInputElement) {
      valueInput.type = meta.inputType;
      valueInput.placeholder = meta.placeholder;
      valueInput.value = "";
    }
    const localOnly = SocketConsumptionTargetUI.#isLocalOnlyMode(modeSelect.value);
    scopeGroup?.classList.toggle("hidden", localOnly);
    if (localOnly && scopeSelect instanceof HTMLSelectElement) {
      scopeSelect.value = SOCKET_CONSUMPTION_SCOPES.ITEM;
    }
  }

  static #syncTarget(group, { onlyWhenComplete = false } = {}) {
    const modeSelect = group.querySelector('[data-sc-sockets-field="mode"]');
    const valueInput = group.querySelector('[data-sc-sockets-field="value"]');
    const scopeSelect = group.querySelector('[data-sc-sockets-field="scope"]');
    const filterInput = group.querySelector('[data-sc-sockets-field="filter"]');
    const hidden = group.querySelector('input[type="hidden"][name^="consumption.targets."]');
    if (!(modeSelect instanceof HTMLSelectElement) || !(hidden instanceof HTMLInputElement)) {
      return;
    }

    const mode = modeSelect.value;
    const rawValue = valueInput instanceof HTMLInputElement ? valueInput.value.trim() : "";
    const scope = scopeSelect instanceof HTMLSelectElement
      ? scopeSelect.value
      : SOCKET_CONSUMPTION_SCOPES.ITEM;
    const filter = filterInput instanceof HTMLTextAreaElement ? filterInput.value.trim() : "";
    const composed = SocketConsumptionTargetUI.#composeTarget(mode, rawValue, scope, filter);
    if (onlyWhenComplete && !composed.length) {
      hidden.value = "";
      return;
    }

    hidden.value = composed;
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  }

  static #composeTarget(mode, rawValue, scope, filter) {
    const shared = { mode, scope, filter };
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT
      || mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY_GEM) {
      return formatSocketTarget(shared);
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY) {
      return rawValue.length ? formatSocketTarget({ ...shared, resourceKey: rawValue }) : "";
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME) {
      return rawValue.length ? formatSocketTarget({ ...shared, gemName: rawValue }) : "";
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH) {
      return rawValue.length ? formatSocketTarget({ ...shared, gemNamePattern: rawValue }) : "";
    }
    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT) {
      const displayNumber = Number(rawValue);
      return Number.isInteger(displayNumber) && displayNumber >= 1
        ? formatSocketTarget({ ...shared, slotIndex: displayNumber - 1 })
        : "";
    }
    return "";
  }

  static #isLocalOnlyMode(mode) {
    return mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT
      || mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT;
  }

  static #escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  static #rootOf(html) {
    if (!html) return null;
    if (html.jquery || typeof html.get === "function") {
      return html[0] ?? html.get(0) ?? null;
    }
    if (html instanceof Element || html?.querySelector) {
      return html;
    }
    return null;
  }
}
