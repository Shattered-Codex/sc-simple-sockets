import { Constants } from "../../../../Constants.js";
import { ItemResolver } from "../../../../ItemResolver.js";
import { SocketAPI } from "../../../../api/SocketAPI.js";
import { SelectionController } from "../../../../api/SelectionController.js";
import { matchesGemNamePattern } from "../../../../helpers/socketConsumptionConfig.js";
import { ModuleSettings } from "../../../../settings/ModuleSettings.js";
import { SocketSlotConfigService } from "../../../../services/SocketSlotConfigService.js";
import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { ScMoreActivitiesGemPickerApp } from "../../ScMoreActivitiesGemPickerApp.js";
import { ScMoreActivitiesSlotPickerApp } from "../../ScMoreActivitiesSlotPickerApp.js";

const escapeHtml = (str) => foundry.utils?.escapeHtml?.(str) ?? String(str ?? "");
const canEditItem = (item) => game.user?.isGM === true || item?.isOwner === true;

export class ScMoreActivitiesGemReloadActivityService {
  static async execute(activity, usageContext = {}) {
    const sourceActor = ScMoreActivitiesGemReloadActivityService.#getSourceActor(activity);
    if (!sourceActor) {
      ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.NoSourceActor",
          "This activity needs an actor inventory to draw gems from."
        )
      );
      return usageContext.results;
    }

    if (!ScMoreActivitiesGemReloadActivityService.#hasValidGemConfiguration(activity)) {
      ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.InvalidGemQuery",
          "Configure a gem name or match pattern before using this activity."
        )
      );
      return usageContext.results;
    }

    const selection = ScMoreActivitiesGemReloadActivityService.#getTargetMode(activity) === "self"
      ? await ScMoreActivitiesGemReloadActivityService.#selectSelfItem(activity, sourceActor)
      : await ScMoreActivitiesGemReloadActivityService.#selectTargetItem(activity, sourceActor);
    if (!selection) {
      return usageContext.results;
    }

    const { item, gems } = selection;
    const gemChoice = await ScMoreActivitiesGemReloadActivityService.#pickGem(activity, item, sourceActor, gems);
    if (!gemChoice) {
      return usageContext.results;
    }

    return ScMoreActivitiesGemReloadActivityService.#reloadGemIntoSlot(activity, item, gemChoice, usageContext);
  }

  static #getSourceActor(activity) {
    return activity?.actor ?? activity?.item?.actor ?? activity?.item?.parent ?? null;
  }

  static #getTargetMode(activity) {
    return activity?.reload?.targetMode === "self" ? "self" : "select";
  }

  static #getGemMode(activity) {
    const mode = String(activity?.reload?.gemMode ?? "prompt").trim().toLowerCase();
    return ["prompt", "name", "match"].includes(mode) ? mode : "prompt";
  }

  static #getGemQuery(activity) {
    return String(activity?.reload?.gemQuery ?? "").trim();
  }

  static #getSlotMode(activity) {
    const mode = String(activity?.reload?.slotMode ?? "ordered").trim().toLowerCase();
    return mode === "prompt" ? "prompt" : "ordered";
  }

  static #getGemQuantity(gemItem) {
    const rawQuantity = gemItem?.system?.quantity;
    if (rawQuantity === null || rawQuantity === undefined || rawQuantity === "") {
      return 1;
    }

    const quantity = Number(rawQuantity);
    return Number.isFinite(quantity) ? quantity : 1;
  }

  static #hasValidGemConfiguration(activity) {
    const mode = ScMoreActivitiesGemReloadActivityService.#getGemMode(activity);
    if (mode === "prompt") {
      return true;
    }
    return ScMoreActivitiesGemReloadActivityService.#getGemQuery(activity).length > 0;
  }

  static async #selectTargetItem(activity, sourceActor) {
    const { DialogV2 } = foundry.applications.api;

    while (true) {
      const item = await SelectionController.selectItem({
        cursorClass: SelectionController.CURSOR_CLASS,
        cursorUrl: String(activity?.reload?.cursorImage ?? "").trim(),
        messageKey: "SCSockets.Integrations.ScMoreActivities.GemReload.Selection.Prompt",
        messageFallback: "Click the item that should receive a gem. Press Esc to cancel.",
        notifications: true
      });

      if (!item) {
        ui.notifications?.info?.(
          Constants.localize(
            "SCSockets.Integrations.ScMoreActivities.GemReload.Selection.Cancelled",
            "Selection cancelled."
          )
        );
        return null;
      }

      const itemName = escapeHtml(item?.name ?? "");
      if (!canEditItem(item)) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.ItemPermissionTitle",
              "Cannot Edit Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.ItemPermissionBody",
              { name: itemName }
            ) ?? `You do not have permission to edit ${itemName}.`}</p>
            <p>${Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.Common.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return null;
        continue;
      }

      if (!ModuleSettings.isItemSocketable(item)) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.InvalidTypeTitle",
              "Unsupported Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.InvalidTypeBody",
              { name: itemName }
            ) ?? `${itemName} cannot use sockets.`}</p>
            <p>${Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.Common.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return null;
        continue;
      }

      const compatibility = await ScMoreActivitiesGemReloadActivityService.#listCompatibleGems(sourceActor, item, activity);
      if (compatibility.gems.length) {
        if (compatibility.conditionErrors.length) {
          ui.notifications?.warn?.(
            game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.SlotConditionError",
              {
                item: item?.name ?? "",
                slots: ScMoreActivitiesGemReloadActivityService.#getConditionErrorSlotSummary(
                  compatibility.conditionErrors
                )
              }
            ) ?? `${item?.name ?? "The item"} has socket conditions that could not be evaluated: ${ScMoreActivitiesGemReloadActivityService.#getConditionErrorSlotSummary(compatibility.conditionErrors)}.`
          );
        }

        return { item, gems: compatibility.gems };
      }

      const body = compatibility.conditionErrors.length
        ? game.i18n?.format?.(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.SlotConditionErrorBody",
          {
            name: itemName,
            slots: escapeHtml(
              ScMoreActivitiesGemReloadActivityService.#getConditionErrorSlotSummary(compatibility.conditionErrors)
            )
          }
        ) ?? `${itemName} has socket conditions that could not be evaluated: ${escapeHtml(ScMoreActivitiesGemReloadActivityService.#getConditionErrorSlotSummary(compatibility.conditionErrors))}. Fix the slot condition or choose another item.`
        : compatibility.hasEmptySlots
          ? game.i18n?.format?.(
            "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.NoCompatibleGemsBody",
            { actor: escapeHtml(sourceActor?.name ?? ""), name: itemName }
          ) ?? `${escapeHtml(sourceActor?.name ?? "The actor")} has no compatible gems for ${itemName}.`
          : game.i18n?.format?.(
            "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.NoEmptySlotsBody",
            { name: itemName }
          ) ?? `${itemName} has no empty sockets available.`;

      const retry = await DialogV2.confirm({
        window: {
          title: Constants.localize(
            compatibility.conditionErrors.length
              ? "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.SlotConditionErrorTitle"
              : compatibility.hasEmptySlots
                ? "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.NoCompatibleGemsTitle"
                : "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.NoEmptySlotsTitle",
            compatibility.conditionErrors.length
              ? "Socket Condition Error"
              : compatibility.hasEmptySlots ? "No Compatible Gems" : "No Empty Slots"
          )
        },
        content: `
          <p>${body}</p>
          <p>${Constants.localize(
            "SCSockets.Integrations.ScMoreActivities.Common.SelectAnother",
            "Do you want to select another item?"
          )}</p>
        `,
        modal: true
      });

      if (!retry) {
        return null;
      }
    }
  }

  static async #selectSelfItem(activity, sourceActor) {
    const item = activity?.item ?? null;
    const itemName = item?.name ?? "";

    if (!item) {
      ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.Warnings.InvalidRequest",
          "The socket activity request is no longer valid."
        )
      );
      return null;
    }

    if (!canEditItem(item)) {
      ui.notifications?.warn?.(
        game.i18n?.format?.(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.ItemPermissionBody",
          { name: itemName }
        ) ?? `You do not have permission to edit ${itemName}.`
      );
      return null;
    }

    if (!ModuleSettings.isItemSocketable(item)) {
      ui.notifications?.warn?.(
        game.i18n?.format?.(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.InvalidTypeBody",
          { name: itemName }
        ) ?? `${itemName} cannot use sockets.`
      );
      return null;
    }

    const compatibility = await ScMoreActivitiesGemReloadActivityService.#listCompatibleGems(sourceActor, item, activity);
    if (compatibility.gems.length) {
      if (compatibility.conditionErrors.length) {
        ui.notifications?.warn?.(
          game.i18n?.format?.(
            "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.SlotConditionError",
            {
              item: itemName,
              slots: ScMoreActivitiesGemReloadActivityService.#getConditionErrorSlotSummary(compatibility.conditionErrors)
            }
          ) ?? `${itemName || "The item"} has socket conditions that could not be evaluated: ${ScMoreActivitiesGemReloadActivityService.#getConditionErrorSlotSummary(compatibility.conditionErrors)}.`
        );
      }

      return { item, gems: compatibility.gems };
    }

    const warning = compatibility.conditionErrors.length
      ? game.i18n?.format?.(
        "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.SlotConditionError",
        {
          item: itemName,
          slots: ScMoreActivitiesGemReloadActivityService.#getConditionErrorSlotSummary(compatibility.conditionErrors)
        }
      ) ?? `${itemName || "The item"} has socket conditions that could not be evaluated: ${ScMoreActivitiesGemReloadActivityService.#getConditionErrorSlotSummary(compatibility.conditionErrors)}.`
      : compatibility.hasEmptySlots
        ? game.i18n?.format?.(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.NoCompatibleGemsBody",
          { actor: sourceActor?.name ?? "", name: itemName }
        ) ?? `${sourceActor?.name ?? "The actor"} has no compatible gems for ${itemName || "the item"}.`
        : game.i18n?.format?.(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.NoEmptySlotsBody",
          { name: itemName }
        ) ?? `${itemName || "The item"} has no empty sockets available.`;

    ui.notifications?.warn?.(warning);
    return null;
  }

  static async #listCompatibleGems(sourceActor, item, activity) {
    const conditionErrors = new Map();
    const slotEntries = await SocketAPI.getItemSlots(item?.uuid, { includeSnapshots: true });
    const emptySlotEntries = (Array.isArray(slotEntries) ? slotEntries : []).filter((entry) => entry?.hasGem !== true);

    if (!emptySlotEntries.length) {
      return { gems: [], hasEmptySlots: false, conditionErrors: [] };
    }

    const mode = ScMoreActivitiesGemReloadActivityService.#getGemMode(activity);
    const query = ScMoreActivitiesGemReloadActivityService.#getGemQuery(activity);
    const hostTypeKeys = ScMoreActivitiesGemReloadActivityService.#resolveHostTypeKeys(item);

    const prospects = [];
    for (const gemItem of ScMoreActivitiesGemReloadActivityService.#getActorItems(sourceActor)) {
      if (!ItemResolver.isGem(gemItem)) {
        continue;
      }

      const quantity = ScMoreActivitiesGemReloadActivityService.#getGemQuantity(gemItem);
      if (quantity <= 0) {
        continue;
      }

      if (!ScMoreActivitiesGemReloadActivityService.#matchesGemFilter(gemItem, mode, query)) {
        continue;
      }

      if (!ScMoreActivitiesGemReloadActivityService.#gemMatchesHostType(gemItem, hostTypeKeys)) {
        continue;
      }

      prospects.push({ gemItem, quantity });
    }

    const evaluations = await Promise.all(prospects.map(async ({ gemItem, quantity }) => ({
      gemItem,
      quantity,
      ...(await ScMoreActivitiesGemReloadActivityService.#listCompatibleSlots(item, gemItem, emptySlotEntries))
    })));

    const candidates = [];
    for (const evaluation of evaluations) {
      ScMoreActivitiesGemReloadActivityService.#mergeConditionErrors(conditionErrors, evaluation.conditionErrors);
      if (!evaluation.compatibleSlots.length) {
        continue;
      }

      candidates.push({
        gemItem: evaluation.gemItem,
        compatibleSlots: evaluation.compatibleSlots,
        quantity: evaluation.quantity
      });
    }

    return {
      gems: candidates,
      hasEmptySlots: true,
      conditionErrors: Array.from(conditionErrors.values()).sort((left, right) => left.slotIndex - right.slotIndex)
    };
  }

  static #getActorItems(actor) {
    const items = actor?.items;
    if (!items) {
      return [];
    }
    if (typeof items.values === "function") {
      return Array.from(items.values());
    }
    if (Array.isArray(items.contents)) {
      return [...items.contents];
    }
    if (Array.isArray(items)) {
      return [...items];
    }
    return [];
  }

  static #matchesGemFilter(gemItem, mode, query) {
    const gemName = String(gemItem?.name ?? "").trim();

    if (mode === "name") {
      return gemName.localeCompare(query, undefined, { sensitivity: "accent" }) === 0;
    }

    if (mode === "match") {
      return matchesGemNamePattern(query, gemName);
    }

    return true;
  }

  static #mergeConditionErrors(bucket, errors = []) {
    for (const error of errors) {
      const slotIndex = Number(error?.slotIndex);
      const key = Number.isInteger(slotIndex)
        ? slotIndex
        : String(error?.slotLabel ?? `unknown-${bucket.size}`);
      if (bucket.has(key)) {
        continue;
      }

      bucket.set(key, {
        slotIndex: Number.isInteger(slotIndex) ? slotIndex : Number.MAX_SAFE_INTEGER,
        slotLabel: String(error?.slotLabel ?? "").trim()
      });
    }
  }

  static #getConditionErrorSlotSummary(errors = []) {
    const labels = (Array.isArray(errors) ? errors : [])
      .map((error) => {
        const slotLabel = String(error?.slotLabel ?? "").trim();
        if (slotLabel.length) {
          return slotLabel;
        }

        const slotIndex = Number(error?.slotIndex);
        if (!Number.isInteger(slotIndex) || slotIndex < 0) {
          return null;
        }

        return `${Constants.localize("SCSockets.ColumnSlot", "Slot")} ${slotIndex + 1}`;
      })
      .filter(Boolean);

    if (!labels.length) {
      return Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.GemReload.Dialogs.UnknownSlots",
        "one or more sockets"
      );
    }

    const visibleLabels = labels.slice(0, 3);
    const remaining = labels.length - visibleLabels.length;
    if (remaining > 0) {
      visibleLabels.push(`+${remaining}`);
    }

    return visibleLabels.join(", ");
  }

  static async #listCompatibleSlots(item, gemItem, entries) {
    const slots = [];
    const conditionErrors = [];
    const slotEntries = Array.isArray(entries) ? entries : [];

    const conditions = await Promise.all(slotEntries.map((entry) => SocketSlotConfigService.evaluateCondition({
      hostItem: item,
      slot: entry?.slot ?? null,
      slotIndex: Number(entry?.slotIndex),
      gemItem,
      source: gemItem
    })));

    slotEntries.forEach((entry, index) => {
      const condition = conditions[index];
      if (condition.error) {
        conditionErrors.push(ScMoreActivitiesIntegration.toSlotSummary(entry));
        return;
      }

      if (condition.allowed) {
        slots.push(ScMoreActivitiesIntegration.toSlotSummary(entry));
      }
    });

    return {
      compatibleSlots: slots.sort((left, right) => left.slotIndex - right.slotIndex),
      conditionErrors
    };
  }

  static #gemMatchesHostType(gemItem, hostTypeKeys) {
    if (!gemItem) {
      return false;
    }

    const allowed = typeof gemItem?.getFlag === "function"
      ? gemItem.getFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ALLOWED_TYPES)
      : foundry.utils?.getProperty?.(gemItem, `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_ALLOWED_TYPES}`);
    if (!Array.isArray(allowed) || !allowed.length) {
      return true;
    }

    if (allowed.includes(Constants.GEM_ALLOWED_TYPES_ALL)) {
      return true;
    }

    return hostTypeKeys.some((key) => allowed.includes(key));
  }

  static #resolveHostTypeKeys(hostItem) {
    const keys = new Set();
    if (!hostItem) {
      return [];
    }

    const type = typeof hostItem.type === "string"
      ? hostItem.type
      : String(hostItem.type ?? "");
    const getProperty = globalThis?.foundry?.utils?.getProperty;
    const subtypePaths = [
      "system.type.value",
      "system.type.subtype"
    ];

    for (const path of subtypePaths) {
      const value = typeof getProperty === "function" ? getProperty(hostItem, path) : undefined;
      if (!value) {
        continue;
      }

      const normalized = typeof value === "string" ? value : String(value);
      keys.add(`${type}:${normalized}`);
    }

    if (type) {
      keys.add(type);
    }

    return Array.from(keys);
  }

  static async #pickGem(activity, item, sourceActor, gems) {
    if (!gems.length) {
      return null;
    }

    const mode = ScMoreActivitiesGemReloadActivityService.#getGemMode(activity);
    if (mode !== "prompt" || gems.length === 1) {
      return gems[0];
    }

    const slotMode = ScMoreActivitiesGemReloadActivityService.#getSlotMode(activity);
    const picked = await ScMoreActivitiesGemPickerApp.pick({
      title: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.GemReload.App.GemTitle",
        "Choose Gem to Socket"
      ),
      subtitle: game.i18n?.format?.(
        "SCSockets.Integrations.ScMoreActivities.GemReload.App.GemSubtitle",
        {
          actor: sourceActor?.name ?? "",
          count: gems.length,
          item: item?.name ?? ""
        }
      ) ?? `${sourceActor?.name ?? "The actor"} has ${gems.length} compatible gems for ${item?.name ?? "the item"}. Choose which one to socket.`,
      gems: gems.map((entry) => ScMoreActivitiesGemReloadActivityService.#toGemChoice(entry, slotMode))
    });

    return gems.find((entry) => entry.gemItem?.uuid === picked) ?? null;
  }

  static #toGemChoice(entry, slotMode) {
    const name = String(entry?.gemItem?.name ?? "").trim() || Constants.localize("SCSockets.SocketEmptyName", "Empty");
    const quantity = Math.max(0, Number(entry?.quantity ?? 0) || 0);
    const compatibleSlots = Array.isArray(entry?.compatibleSlots) ? entry.compatibleSlots : [];
    const destinationSlot = compatibleSlots[0] ?? null;
    const promptsForSlot = slotMode === "prompt" && compatibleSlots.length > 1;
    const slotLabels = compatibleSlots
      .map((slot) => String(slot?.slotLabel ?? "").trim())
      .filter(Boolean)
      .join(", ");

    const destinationLabel = promptsForSlot
      ? game.i18n?.format?.(
        "SCSockets.Integrations.ScMoreActivities.GemReload.App.GemDestinationChoices",
        { count: compatibleSlots.length, slots: slotLabels }
      ) ?? `${compatibleSlots.length} compatible slots: ${slotLabels}`
      : game.i18n?.format?.(
        "SCSockets.Integrations.ScMoreActivities.GemReload.App.GemDestination",
        { slot: ScMoreActivitiesGemReloadActivityService.#describeDestinationSlot(destinationSlot) }
      ) ?? `Will socket into ${ScMoreActivitiesGemReloadActivityService.#describeDestinationSlot(destinationSlot)}`;

    return {
      ariaLabel: [name, destinationLabel].filter(Boolean).join(". "),
      destinationLabel,
      destinationSlot: promptsForSlot ? null : destinationSlot,
      filterName: name.toLowerCase(),
      img: String(entry?.gemItem?.img ?? "").trim(),
      name,
      quantityLabel: quantity > 1 ? `×${quantity}` : "",
      titleText: name,
      uuid: entry?.gemItem?.uuid ?? ""
    };
  }

  static #describeDestinationSlot(slot) {
    const slotLabel = String(slot?.slotLabel ?? "").trim();
    const slotName = String(slot?.slotName ?? slot?.name ?? "").trim();
    const emptyName = Constants.localize("SCSockets.SocketEmptyName", "Empty");
    if (slotName.length && slotName !== emptyName && slotName !== slotLabel) {
      return slotLabel.length ? `${slotLabel} · ${slotName}` : slotName;
    }

    return slotLabel;
  }

  static async #reloadGemIntoSlot(activity, item, gemChoice, usageContext = {}) {
    const slots = Array.isArray(gemChoice?.compatibleSlots) ? gemChoice.compatibleSlots : [];
    if (!slots.length) {
      ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.NoCompatibleGems",
          "No compatible gems are available for the selected target."
        )
      );
      return usageContext.results;
    }

    const mode = ScMoreActivitiesGemReloadActivityService.#getSlotMode(activity);
    if (mode === "prompt" && slots.length > 1) {
      new ScMoreActivitiesSlotPickerApp({
        confirmLabel: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.GemReload.App.SlotConfirm",
          "Socket into selected slot"
        ),
        emptyMessage: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.NoEmptySlots",
          "The target item has no empty slots available."
        ),
        onConfirm: async (slotIndex) => {
          const result = await ScMoreActivitiesGemReloadActivityService.#reload(activity, item, gemChoice.gemItem, slotIndex);
          ScMoreActivitiesGemReloadActivityService.#notify(result);
          return result;
        },
        slots,
        subtitle: game.i18n?.format?.(
          "SCSockets.Integrations.ScMoreActivities.GemReload.App.SlotSubtitle",
          { count: slots.length, gem: gemChoice.gemItem?.name ?? "", item: item?.name ?? "" }
        ) ?? `${item?.name ?? "The item"} has ${slots.length} compatible empty slots for ${gemChoice.gemItem?.name ?? "the gem"}. Choose one.`,
        title: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.GemReload.App.SlotTitle",
          "Choose Slot"
        )
      }).render(true);

      return usageContext.results;
    }

    const result = await ScMoreActivitiesGemReloadActivityService.#reload(
      activity,
      item,
      gemChoice.gemItem,
      slots[0].slotIndex
    );
    ScMoreActivitiesGemReloadActivityService.#notify(result);
    return result;
  }

  static async #reload(activity, item, gemItem, slotIndex) {
    return ScMoreActivitiesIntegration.reloadGem(activity, {
      gemItem,
      item,
      slotIndex
    });
  }

  static #notify(result) {
    const message = String(result?.result?.message ?? result?.result?.data?.message ?? result?.message ?? "").trim();
    if (!message) {
      return;
    }

    if (result.ok === true && result.changed !== false) {
      ui.notifications?.info?.(message);
      return;
    }

    ui.notifications?.warn?.(message);
  }
}
