import { Constants } from "../../../../Constants.js";
import { SelectionController } from "../../../../api/SelectionController.js";
import { SocketAPI } from "../../../../api/SocketAPI.js";
import { ModuleSettings } from "../../../../settings/ModuleSettings.js";
import { GemResourceService } from "../../../../../domain/gems/GemResourceService.js";
import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { ScMoreActivitiesRechargeRolls } from "../shared/ScMoreActivitiesRechargeRolls.js";

const escapeHtml = (str) => foundry.utils?.escapeHtml?.(str) ?? String(str ?? "");
const canEditItem = (item) => game.user?.isGM === true || item?.isOwner === true;

export class ScMoreActivitiesSocketPoolRechargeActivityService {
  static async execute(activity, usageContext = {}) {
    if (!ScMoreActivitiesRechargeRolls.ensureActorForCheck(activity)) {
      return usageContext.results;
    }

    const selection = await ScMoreActivitiesSocketPoolRechargeActivityService.#selectTargetItem(activity);
    if (!selection) {
      return usageContext.results;
    }

    const { item, pools } = selection;
    const poolKey = pools.length === 1
      ? pools[0].key
      : await ScMoreActivitiesSocketPoolRechargeActivityService.#pickPool(item, pools);
    if (!poolKey) {
      return usageContext.results;
    }

    const result = await ScMoreActivitiesSocketPoolRechargeActivityService.#recharge(activity, item, poolKey);
    ScMoreActivitiesSocketPoolRechargeActivityService.#notify(result);
    return result;
  }

  static #getResourceKeyFilter(activity) {
    return String(activity?.recharge?.resourceKey ?? "").trim();
  }

  static async #selectTargetItem(activity) {
    const { DialogV2 } = foundry.applications.api;
    const resourceKey = ScMoreActivitiesSocketPoolRechargeActivityService.#getResourceKeyFilter(activity);

    while (true) {
      const item = await SelectionController.selectItem({
        cursorClass: SelectionController.CURSOR_CLASS,
        cursorUrl: String(activity?.recharge?.cursorImage ?? "").trim(),
        messageKey: "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Selection.Prompt",
        messageFallback: "Click the item whose socketed charge pool should be recharged. Press Esc to cancel.",
        notifications: true
      });

      if (!item) {
        ui.notifications?.info?.(
          Constants.localize(
            "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Selection.Cancelled",
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
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.ItemPermissionTitle",
              "Cannot Edit Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.ItemPermissionBody",
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

      if (!ModuleSettings.isItemSocketableByType(item)) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.InvalidTypeTitle",
              "Unsupported Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.InvalidTypeBody",
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

      const pools = await ScMoreActivitiesSocketPoolRechargeActivityService.#listRechargeablePools(item, resourceKey);
      if (!pools.length) {
        const body = resourceKey.length
          ? game.i18n?.format?.(
            "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Dialogs.NoMatchingPoolBody",
            { name: itemName, key: escapeHtml(resourceKey) }
          ) ?? `${itemName} has no missing "${escapeHtml(resourceKey)}" charges.`
          : game.i18n?.format?.(
            "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Dialogs.NoPoolsBody",
            { name: itemName }
          ) ?? `${itemName} has no socketed charge pools with missing charges.`;

        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Dialogs.NoPoolsTitle",
              "No Rechargeable Pools"
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

        if (!retry) return null;
        continue;
      }

      return { item, pools };
    }
  }

  static async #listRechargeablePools(item, resourceKey = "") {
    const wantedKey = String(resourceKey ?? "").trim().toLowerCase();
    const entries = await SocketAPI.getItemSlots(item.uuid, { includeSnapshots: true });
    const slots = (Array.isArray(entries) ? entries : []).map((entry) => entry?.slot ?? null);
    return GemResourceService.aggregatePools(slots)
      .filter((pool) => pool.value < pool.max)
      .filter((pool) => !wantedKey.length || pool.key.toLowerCase() === wantedKey);
  }

  static async #pickPool(item, pools) {
    const { DialogV2 } = foundry.applications.api;
    const options = pools
      .map((pool) => `<option value="${escapeHtml(pool.key)}">${escapeHtml(pool.key)} (${pool.value}/${pool.max})</option>`)
      .join("");

    const picked = await DialogV2.prompt({
      window: {
        title: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.App.Title",
          "Choose Charge Pool"
        )
      },
      content: `
        <p class="hint">${game.i18n?.format?.(
          "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.App.Subtitle",
          { count: pools.length, item: escapeHtml(item?.name ?? "") }
        ) ?? `${escapeHtml(item?.name ?? "The item")} has ${pools.length} charge pools with missing charges. Choose which one to recharge.`}</p>
        <div class="form-group">
          <div class="form-fields">
            <select name="poolKey" autofocus>${options}</select>
          </div>
        </div>
      `,
      ok: {
        label: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.App.Confirm",
          "Recharge pool"
        ),
        callback: (event, button) => {
          const field = button?.form?.elements?.poolKey
            ?? event?.currentTarget?.form?.elements?.poolKey
            ?? button?.closest?.("[data-app-id], [data-appid], .window-app, dialog, form")?.querySelector?.('[name="poolKey"]')
            ?? event?.currentTarget?.closest?.("[data-app-id], [data-appid], .window-app, dialog, form")?.querySelector?.('[name="poolKey"]')
            ?? button?.ownerDocument?.querySelector?.('[name="poolKey"]')
            ?? event?.currentTarget?.ownerDocument?.querySelector?.('[name="poolKey"]');
          return typeof field?.value === "string" && field.value.length ? field.value : null;
        }
      },
      rejectClose: false,
      modal: true
    });

    return typeof picked === "string" && picked.length ? picked : null;
  }

  static async #recharge(activity, item, poolKey) {
    const check = await ScMoreActivitiesRechargeRolls.performCheck(activity);
    if (!check.ok) {
      return check;
    }

    if (!check.success) {
      return Object.freeze({
        ok: true,
        changed: false,
        reason: "check-failed",
        message: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.CheckFailed",
          "The recharge attempt failed. No charges were restored."
        )
      });
    }

    const amount = await ScMoreActivitiesRechargeRolls.rollAmount(activity);
    if (amount === false) {
      return { ok: false, reason: "roll-cancelled" };
    }

    return ScMoreActivitiesIntegration.rechargePool(activity, { amount, item, resourceKey: poolKey });
  }

  static #notify(result) {
    if (!result?.message) {
      return;
    }

    if (result.ok === true && result.changed !== false) {
      ui.notifications?.info?.(result.message);
      return;
    }

    ui.notifications?.warn?.(result.message);
  }
}
