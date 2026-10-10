import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { EffectService } from "./EffectService.js";
import { ActivityTransferService } from "./ActivityTransferService.js";
import { InventoryService } from "./InventoryService.js";
import { ItemResolver } from "../ItemResolver.js";
import { SocketSlot } from "../model/SocketSlot.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { SocketSlotConfigService } from "./SocketSlotConfigService.js";
import { ItemSheetSync } from "../support/ItemSheetSync.js";
import { DebugTrace } from "../support/DebugTrace.js";
import { HostItemUpdateService } from "../support/HostItemUpdateService.js";
import { HostOperationQueue } from "../support/HostOperationQueue.js";
import { GemRemovalCheckService } from "./GemRemovalCheckService.js";
import { GemInsertionCheckService } from "./GemInsertionCheckService.js";
import { GemBreakService } from "../../domain/gems/GemBreakService.js";
import { GemConcealmentService } from "../../domain/gems/GemConcealmentService.js";

export class SocketService {
  static REMOVE_GEM_MODE_DEFAULT = "default";
  static REMOVE_GEM_MODE_KEEP = "keep";
  static REMOVE_GEM_MODE_DELETE = "delete";

  /** Slots with a removal check in flight, as `<host uuid>:<slot index>`. */
  static #GM_SLOT_CONFIG_KEYS = Object.freeze([
    "hidden",
    "removalCheckType", "removalCheckDc", "removalCheckDcMode", "removalCheckRarityDcs", "removalCheckFailure",
    "insertionCheckType", "insertionCheckDc", "insertionCheckDcMode", "insertionCheckRarityDcs", "insertionCheckFailure"
  ]);
  static #pendingRemovalChecks = new Set();
  /** Slots with an insertion check in flight, keyed the same way. */
  static #pendingInsertionChecks = new Set();

  static async addGem(hostItem, idx, source, options = {}) {
    // Without an insertion check the operation is queued right away, in the
    // order it was asked for.
    if (
      options?.insertionCheck !== true
      || options?.skipInsertionCheck === true
      || !GemInsertionCheckService.applies({ hostItem: SocketService.#resolveHostItem(hostItem) })
    ) {
      return SocketService.#enqueueHostOperation(
        hostItem,
        (currentHostItem) => SocketService.#addGem(currentHostItem, idx, source, options)
      );
    }

    // Like the removal check, the insertion check may open a roll dialog, so
    // it runs before the operation is queued.
    const check = await SocketService.#runInsertionCheck(hostItem, idx, source, options);
    if (check.result) {
      return check.result;
    }

    try {
      return await SocketService.#enqueueHostOperation(
        hostItem,
        (currentHostItem) => SocketService.#addGem(currentHostItem, check.idx ?? idx, check.source ?? source, options)
      );
    } finally {
      check.release?.();
    }
  }

  static async removeGem(hostItem, idx, options = {}) {
    // The check may open a roll dialog, so it runs before the operation is
    // queued: a pending dialog must not hold up other writes to the host item.
    const check = await SocketService.#runRemovalCheck(hostItem, idx, options);
    if (check.result) {
      return check.result;
    }

    try {
      return await SocketService.#enqueueHostOperation(
        hostItem,
        (currentHostItem) => SocketService.#removeGem(currentHostItem, idx, options, check.removal)
      );
    } finally {
      check.release?.();
    }
  }

  static async removeSlotWithContents(hostItem, idx, options = {}) {
    const check = await SocketService.#runRemovalCheck(hostItem, idx, options, [
      ModuleSettings.SOCKET_ACTION_REMOVE_SLOT,
      ModuleSettings.SOCKET_ACTION_REMOVE_GEM
    ]);
    if (check.result) {
      return check.result;
    }
    try {
      return await SocketService.#enqueueHostOperation(
        hostItem,
        (currentHostItem) => SocketService.#removeSlotWithContents(currentHostItem, idx, options, check.removal)
      );
    } finally {
      check.release?.();
    }
  }

  static async addSlot(hostItem, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#addSlot(currentHostItem, options)
    );
  }

  static async removeSlot(hostItem, idx, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#removeSlot(currentHostItem, idx, options)
    );
  }

  static async mutateSockets(hostItem, operation, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      async (currentHostItem) => {
        if (!SocketService.#canUseSocketsOnHost(currentHostItem)) {
          return SocketService.#warnAndReturnResult(
            "warn",
            "host-not-socketable",
            Constants.localize(
              "SCSockets.Notifications.HostNotSocketable",
              "This item type cannot receive sockets."
            )
          );
        }

        // `options.permission` names the socket action the operation amounts to.
        const action = options?.permission ?? ModuleSettings.SOCKET_ACTION_ADD_GEM;
        if (!SocketService.#canMutateSockets(options, action)) {
          return SocketService.#warnAndReturnResult(
            "warn",
            "permission-denied",
            Constants.localize(
              "SCSockets.Notifications.EditPermissionDenied",
              "You do not have permission to modify sockets on this item."
            )
          );
        }

        return operation(SocketService.#resolveHostItem(currentHostItem));
      }
    );
  }

  static getSlots(hostItem) {
    return SocketStore.peekSlots(SocketService.#resolveHostItem(hostItem));
  }

  static async updateSlotConfig(hostItem, idx, config, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#updateSlotConfig(currentHostItem, idx, config, options)
    );
  }

  /**
   * Everything that can refuse a gem before anything is written: the host,
   * the permissions, the slot, the gem and the slot's condition.
   * Returns `{ result }` with the refusal, or `{ idx, gemItem, slots }`.
   */
  static async #validateAddGem(hostItem, idx, source, options = {}) {
    const invalid = (result) => ({ result });

    if (!SocketService.#canUseSocketsOnHost(hostItem)) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "host-not-socketable",
        Constants.localize(
          "SCSockets.Notifications.HostNotSocketable",
          "This item type cannot receive sockets."
        )
      ));
    }

    if (!SocketService.#canMutateSockets(options, ModuleSettings.SOCKET_ACTION_ADD_GEM)) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "permission-denied",
        Constants.localize(
          "SCSockets.Notifications.EditPermissionDenied",
          "You do not have permission to modify sockets on this item."
        )
      ));
    }

    const slots = SocketStore.getSlots(hostItem);

    if (idx == null) {
      idx = slots.findIndex((slot) => !slot?.gem && !slot?._gemData);
      if (idx < 0) {
        return invalid(SocketService.#buildResult({
          success: false,
          changed: false,
          reason: "no-available-slot"
        }));
      }
    }

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "invalid-slot-index",
        Constants.localize("SCSockets.Notifications.InvalidSocketIndex", "Invalid socket index.")
      ));
    }

    let gemItem = null;
    if (typeof source === "string") {
      try {
        gemItem = await fromUuid(source);
      } catch (error) {
        if (Constants.isDebugEnabled()) {
          console.debug(`[${Constants.MODULE_ID}] Could not resolve gem UUID "${source}":`, error);
        }
      }
    } else if (source?.documentName === "Item") {
      gemItem = source;
    } else {
      gemItem = await ItemResolver.resolveDraggedItem(source);
    }

    if (!gemItem) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "cannot-resolve-item",
        Constants.localize("SCSockets.Notifications.CannotResolveItem", "Cannot resolve dropped item.")
      ));
    }

    if (!ItemResolver.isGem(gemItem)) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "not-a-gem",
        Constants.localize(
          "SCSockets.Notifications.OnlyGems",
          "Only socket-compatible items can be inserted."
        )
      ));
    }

    if (GemBreakService.isBroken(gemItem)) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "gem-broken",
        Constants.localize(
          "SCSockets.Notifications.GemBroken",
          "This gem is broken and must be repaired before it can be socketed."
        )
      ));
    }

    if (!SocketService.#gemMatchesHostType(gemItem, hostItem)) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "gem-incompatible",
        Constants.localize(
          "SCSockets.Notifications.GemIncompatible",
          "That item is not compatible with this socket."
        )
      ));
    }

    const conditionResult = await SocketSlotConfigService.evaluateCondition({
      hostItem,
      slot: slots[idx],
      slotIndex: idx,
      gemItem,
      source
    });
    if (!conditionResult.allowed) {
      const key = conditionResult.error
        ? "SCSockets.Notifications.SocketConditionError"
        : "SCSockets.Notifications.SocketConditionFailed";
      const fallback = conditionResult.error
        ? "This socket condition could not be evaluated."
        : "That gem does not meet this socket's requirements.";
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        conditionResult.error ? "socket-condition-error" : "socket-condition-failed",
        Constants.localize(key, fallback)
      ));
    }

    // Dropping a gem onto a filled socket takes the old gem out, which needs
    // the permission to remove gems as well.
    if (
      (slots[idx]?.gem || slots[idx]?._gemData)
      && !SocketService.#canMutateSockets(options, ModuleSettings.SOCKET_ACTION_REMOVE_GEM)
    ) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "permission-denied",
        Constants.localize(
          "SCSockets.Notifications.RemoveGemPermissionDenied",
          "You do not have permission to remove the gem already in this socket."
        )
      ));
    }

    // Dropping a gem onto a filled socket would swap the old gem out without
    // the removal check, so the old gem has to be removed first.
    if (
      options?.skipRemovalCheck !== true
      && GemRemovalCheckService.plan({ hostItem, slot: slots[idx] }).required
    ) {
      return invalid(SocketService.#warnAndReturnResult(
        "warn",
        "removal-check-required",
        Constants.localize(
          "SCSockets.RemovalCheck.Notifications.ReplaceBlocked",
          "Remove the gem in this socket first: taking it out requires a check."
        )
      ));
    }

    return { result: null, idx, gemItem, slots };
  }

  static async #addGem(hostItem, idx, source, options = {}) {
    DebugTrace.log("socket-service.addGem.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(hostItem?.actor ?? hostItem?.parent),
      slotIndex: idx,
      sourceUuid: typeof source === "string" ? source : source?.uuid ?? null,
      options: DebugTrace.describeOptions(options)
    });
    const validated = await SocketService.#validateAddGem(hostItem, idx, source, options);
    if (validated.result) {
      return validated.result;
    }
    const { gemItem, slots } = validated;
    idx = validated.idx;

    const previousSlot = slots[idx] ?? {};
    const shouldDeleteReplacedGem = SocketService.#shouldDeleteGemOnRemoval(previousSlot);
    const shouldReturnReplacedGem = Boolean(previousSlot?.gem || previousSlot?._gemData) && !shouldDeleteReplacedGem;
    const replacedGemSnapshot = shouldReturnReplacedGem
      ? ItemResolver.expandSnapshot(previousSlot?._gemData ?? null)
      : null;
    SocketService.#keepGemUnidentified(hostItem, replacedGemSnapshot);

    const noRender = SocketService.#buildInternalUpdateOptions({ render: false }, options);
    DebugTrace.log("socket-service.addGem.noRender", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx,
      options: DebugTrace.describeOptions(noRender)
    });

    const hostState = SocketService.#captureHostState(hostItem);
    const incomingGemSnapshot = ItemResolver.snapshotOne(gemItem);
    let consumedIncomingGem = false;

    try {
      // The gem may have been spent or broken by another operation on the
      // same stack since it was validated; then there is nothing to socket.
      consumedIncomingGem = await InventoryService.consumeOne(gemItem, {}, { requireIntact: true });
      if (gemItem?.actor && !consumedIncomingGem) {
        return SocketService.#warnAndReturnResult(
          "warn",
          "gem-unavailable",
          Constants.localize("SCSockets.Notifications.GemUnavailable", "That gem is no longer available.")
        );
      }

      try {
        await EffectService.removeGemEffects(hostItem, idx, noRender);
      } catch (e) {
        console.error(`[${Constants.MODULE_ID}] removeGemEffects failed:`, e);
      }

      await ActivityTransferService.removeForSlot(hostItem, idx, noRender);

      slots[idx] = SocketSlot.fillFromGem(slots[idx], gemItem, incomingGemSnapshot, idx);
      ItemResolver.normalizeSocketSlots(slots);

      const effectIdMap = await EffectService.applyGemEffects(hostItem, idx, gemItem, noRender);
      await ActivityTransferService.applyFromGem(hostItem, idx, gemItem, {
        ...noRender,
        // Publish the completed state to actor sheets on every client. The
        // effect writes above stay silent, but their bonuses must now appear.
        render: true,
        [Constants.MODULE_ID]: {
          ...(noRender?.[Constants.MODULE_ID] ?? {}),
          [ActivityTransferService.UPDATE_OPTION_SKIP_REMOVE_EXISTING]: true,
          [ActivityTransferService.UPDATE_OPTION_EFFECT_ID_MAP]: effectIdMap,
          [ActivityTransferService.UPDATE_OPTION_EXTRA_UPDATE_DATA]: {
            [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: slots
          }
        }
      });

      if (shouldReturnReplacedGem) {
        await InventoryService.returnOne(hostItem, replacedGemSnapshot);
      }
    } catch (error) {
      await SocketService.#rollbackHostOperation(hostItem, hostState, noRender, {
        consumedIncomingGem,
        consumedIncomingSnapshot: incomingGemSnapshot
      });
      throw error;
    }

    DebugTrace.log("socket-service.addGem.done", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx
    });
    return SocketService.#buildResult({
      success: true,
      changed: true,
      reason: "gem-added",
      slotIndex: idx
    });
  }

  /**
   * Rolls the optional insertion check, once `addGem` decided it may apply.
   * Only callers acting for a player dropping a gem ask for it
   * (`insertionCheck: true`); activities, macros and other automation decide
   * the outcome themselves.
   * Returns `{ result }` when the gem must not be socketed (invalid request,
   * cancelled roll or failed check) and `{ idx, source }` with the resolved
   * slot and gem otherwise. `release` must be called once the gem is in.
   */
  static async #runInsertionCheck(hostItem, idx, source, options = {}) {
    const currentHostItem = SocketService.#resolveHostItem(hostItem);

    // The request is validated first, so nobody rolls for a gem the socket
    // would refuse anyway.
    const validated = await SocketService.#validateAddGem(currentHostItem, idx, source, options);
    if (validated.result) {
      return { result: validated.result };
    }
    const { gemItem } = validated;
    const resolved = { result: null, idx: validated.idx, source: gemItem };
    const plan = GemInsertionCheckService.plan({
      hostItem: currentHostItem,
      slot: validated.slots[validated.idx],
      gemItem
    });
    if (!plan.required) {
      return resolved;
    }

    const hostKey = currentHostItem?.uuid ?? currentHostItem?.id ?? null;
    const pendingKey = hostKey ? `${hostKey}:${validated.idx}` : null;
    if (pendingKey && SocketService.#pendingInsertionChecks.has(pendingKey)) {
      return {
        result: SocketService.#buildResult({ success: false, changed: false, reason: "insertion-check-pending" })
      };
    }
    if (pendingKey) {
      SocketService.#pendingInsertionChecks.add(pendingKey);
    }
    const release = () => SocketService.#pendingInsertionChecks.delete(pendingKey);
    const notify = (key, fallback) => {
      if (options?.notify !== false) {
        ui.notifications?.warn?.(Constants.localize(`SCSockets.InsertionCheck.Notifications.${key}`, fallback));
      }
    };

    try {
      const outcome = await GemInsertionCheckService.roll(plan);
      if (!outcome.ok) {
        const cancelled = outcome.reason === "roll-cancelled";
        if (!cancelled) {
          notify("RollFailed", "The insertion check could not be rolled, so the gem was not socketed.");
        }
        release();
        return {
          result: SocketService.#buildResult({
            success: false,
            changed: false,
            reason: cancelled ? "insertion-check-cancelled" : "insertion-check-error"
          })
        };
      }
      if (outcome.success) {
        return { ...resolved, release };
      }

      const failure = await SocketService.#applyInsertionFailure(gemItem, outcome.failure);
      notify(...{
        [ModuleSettings.INSERTION_FAILURE_BREAK]: ["Broke", "The check failed: the gem broke while being socketed."],
        [ModuleSettings.INSERTION_FAILURE_LOSE]: ["Lost", "The check failed: the gem was destroyed while being socketed."],
        [ModuleSettings.INSERTION_FAILURE_KEEP]: ["Keep", "The check failed: the gem was not socketed."]
      }[failure]);
      release();
      return {
        result: SocketService.#buildResult({
          success: false,
          changed: failure !== ModuleSettings.INSERTION_FAILURE_KEEP,
          reason: "insertion-check-failed",
          insertionCheck: { success: false, total: outcome.total, dc: outcome.dc },
          failure
        })
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  /**
   * Applies a failed insertion check to one unit of the gem and returns the
   * outcome that took effect. A gem that is not in an inventory (dragged from
   * the sidebar or a compendium) is never changed.
   *
   * It runs in the actor's queue and reads the gem again inside it, so
   * failures on the same stack (two sockets, a repair activity) cannot each
   * act on the quantity the other one saw.
   */
  static async #applyInsertionFailure(gemItem, failure) {
    const actor = gemItem?.actor;
    const keep = ModuleSettings.INSERTION_FAILURE_KEEP;
    if (!actor || failure === keep) {
      return keep;
    }

    return HostOperationQueue.enqueue(actor, async () => {
      const current = actor.items?.get?.(gemItem.id) ?? null;
      const quantity = Number(current?.system?.quantity ?? 1);
      // The gem was spent or broken while the roll was open: nothing is left to lose.
      if (!current || !(quantity > 0) || GemBreakService.isBroken(current)) {
        return keep;
      }

      if (failure === ModuleSettings.INSERTION_FAILURE_LOSE) {
        await InventoryService.consumeOneLocked(current);
        return failure;
      }
      if (quantity <= 1) {
        await GemBreakService.break(current);
        return failure;
      }

      const broken = current.toObject();
      delete broken._id;
      GemBreakService.markDataBroken(broken);
      await current.update({ "system.quantity": quantity - 1 });
      try {
        if (!(await InventoryService.returnOneLocked(current, broken))) {
          throw new Error("The broken gem could not be returned to the inventory.");
        }
      } catch (error) {
        await current.update({ "system.quantity": quantity });
        throw error;
      }
      return failure;
    });
  }

  /**
   * Rolls the optional removal check for a default-mode removal.
   * Returns `{ result }` when the removal must stop here (cancelled roll, or a
   * failure that leaves the gem in place) and `{ removal }` otherwise, where
   * `removal` carries the outcome for `#removeGem` — null when no check applied.
   * When a check was rolled, `release` must be called once the removal is done:
   * until then the same slot cannot start a second check.
   */
  static async #runRemovalCheck(
    hostItem,
    idx,
    options = {},
    actions = [ModuleSettings.SOCKET_ACTION_REMOVE_GEM]
  ) {
    const proceed = { removal: null, result: null };

    // An explicit keep/delete mode is a caller-decided outcome (gem
    // consumption, extraction activities), not a player pulling a gem out.
    // Callers that do act for a player (the Extract Gem macro) opt back in
    // with `enforceRemovalCheck`.
    if (
      options?.skipRemovalCheck === true
      || (
        options?.enforceRemovalCheck !== true
        && SocketService.#normalizeRemoveGemMode(options?.mode) !== SocketService.REMOVE_GEM_MODE_DEFAULT
      )
      || !SocketService.#canMutateSockets(options, ...actions)
    ) {
      return proceed;
    }

    const currentHostItem = SocketService.#resolveHostItem(hostItem);
    if (!SocketService.#canUseSocketsOnHost(currentHostItem) || !Number.isInteger(idx) || idx < 0) {
      return proceed;
    }
    const slot = SocketStore.getSlots(currentHostItem)?.[idx] ?? null;
    const plan = GemRemovalCheckService.plan({ hostItem: currentHostItem, slot });
    // The slot is identified even when it needs no check: the removal runs
    // later, from the queue, and must not land on a gem that replaced this one.
    const removal = {
      gemInstanceId: slot?._gemInstanceId ?? null,
      legacyGemIdentity: JSON.stringify([slot?.gem, slot?._srcGemId, slot?._gemData]),
      removalCheck: null,
      failure: null
    };
    if (!plan.required) {
      return { removal, result: null };
    }

    // The roll dialog stays open for as long as the player wants, so a second
    // click on the same slot must not start another check.
    const hostKey = currentHostItem?.uuid ?? currentHostItem?.id ?? null;
    const pendingKey = hostKey ? `${hostKey}:${idx}` : null;
    if (pendingKey && SocketService.#pendingRemovalChecks.has(pendingKey)) {
      return {
        removal: null,
        result: SocketService.#buildResult({ success: false, changed: false, reason: "removal-check-pending" })
      };
    }
    if (pendingKey) {
      SocketService.#pendingRemovalChecks.add(pendingKey);
    }
    const release = () => SocketService.#pendingRemovalChecks.delete(pendingKey);

    let outcome;
    try {
      outcome = await GemRemovalCheckService.roll(plan);
    } catch (error) {
      release();
      throw error;
    }
    if (!outcome.ok) {
      release();
      const cancelled = outcome.reason === "roll-cancelled";
      if (!cancelled && options?.notify !== false) {
        ui.notifications?.warn?.(
          Constants.localize(
            "SCSockets.RemovalCheck.Notifications.RollFailed",
            "The removal check could not be rolled, so the gem was not removed."
          )
        );
      }
      return {
        removal: null,
        result: SocketService.#buildResult({
          success: false,
          changed: false,
          reason: cancelled ? "removal-check-cancelled" : "removal-check-error"
        })
      };
    }

    const removalCheck = { success: outcome.success, total: outcome.total, dc: outcome.dc };
    removal.removalCheck = removalCheck;
    if (outcome.success) {
      return { removal, result: null, release };
    }

    if (outcome.failure === ModuleSettings.REMOVAL_FAILURE_STAY) {
      release();
      if (options?.notify !== false) {
        ui.notifications?.warn?.(
          Constants.localize(
            "SCSockets.RemovalCheck.Notifications.Stay",
            "The check failed: the gem stays in the socket."
          )
        );
      }
      return {
        removal: null,
        result: SocketService.#buildResult({
          success: false,
          changed: false,
          reason: "removal-check-failed",
          removalCheck
        })
      };
    }

    removal.failure = outcome.failure;
    return { removal, result: null, release };
  }

  static async #removeGem(hostItem, idx, options = {}, removal = null) {
    DebugTrace.log("socket-service.removeGem.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(hostItem?.actor ?? hostItem?.parent),
      slotIndex: idx,
      options: DebugTrace.describeOptions(options)
    });
    const slots = SocketStore.getSlots(hostItem);

    if (!SocketService.#canMutateSockets(options, ModuleSettings.SOCKET_ACTION_REMOVE_GEM)) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "permission-denied",
        Constants.localize(
          "SCSockets.Notifications.EditPermissionDenied",
          "You do not have permission to modify sockets on this item."
        )
      );
    }

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return SocketService.#buildResult({ success: false, changed: false, reason: "invalid-slot-index" });
    }

    const slot = slots[idx] ?? {};
    if (!slot?.gem && !slot?._gemData) {
      return SocketService.#buildResult({ success: false, changed: false, reason: "empty-slot" });
    }
    // The check was planned before this operation was queued: make sure it
    // still refers to the gem that is in the slot now.
    if (removal && (
      (slot?._gemInstanceId ?? null) !== removal.gemInstanceId
      || (!removal.gemInstanceId
        && JSON.stringify([slot?.gem, slot?._srcGemId, slot?._gemData]) !== removal.legacyGemIdentity)
    )) {
      return SocketService.#buildResult({ success: false, changed: false, reason: "slot-changed" });
    }

    const removalMode = SocketService.#normalizeRemoveGemMode(options?.mode);
    const shouldDeleteGem = removal?.failure === ModuleSettings.REMOVAL_FAILURE_LOSE
      || SocketService.#shouldDeleteGemOnRemoval(slot, { mode: removalMode });
    const shouldBreakGem = !shouldDeleteGem && removal?.failure === ModuleSettings.REMOVAL_FAILURE_BREAK;
    const gemSnapshot = ItemResolver.expandSnapshot(slot?._gemData ?? null);
    if (shouldBreakGem) {
      GemBreakService.markDataBroken(gemSnapshot);
    }
    SocketService.#keepGemUnidentified(hostItem, gemSnapshot);

    const noRender = SocketService.#buildInternalUpdateOptions({ render: false }, options);
    DebugTrace.log("socket-service.removeGem.noRender", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx,
      options: DebugTrace.describeOptions(noRender)
    });

    const hostState = SocketService.#captureHostState(hostItem);
    let returnedGemItem = null;

    try {
      try {
        await EffectService.removeGemEffects(hostItem, idx, noRender);
      } catch (e) {
        console.error(`[${Constants.MODULE_ID}] removeGemEffects failed:`, e);
      }

      slots[idx] = SocketSlot.clearGem(slot, idx);
      ItemResolver.normalizeSocketSlots(slots);
      await ActivityTransferService.removeForSlot(hostItem, idx, {
        ...noRender,
        // Also refresh when the gem is deleted and no inventory update follows.
        render: true,
        [Constants.MODULE_ID]: {
          ...(noRender?.[Constants.MODULE_ID] ?? {}),
          [ActivityTransferService.UPDATE_OPTION_EXTRA_UPDATE_DATA]: {
            [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: slots
          }
        }
      });

      if (!shouldDeleteGem && gemSnapshot) {
        returnedGemItem = await InventoryService.returnOne(hostItem, gemSnapshot);
      }
    } catch (error) {
      await SocketService.#rollbackHostOperation(hostItem, hostState, noRender, {
        returnedGemItem
      });
      throw error;
    }

    if (options?.notify !== false) {
      if (shouldBreakGem) {
        ui.notifications?.warn?.(
          Constants.localize(
            "SCSockets.RemovalCheck.Notifications.Broke",
            "The check failed: the gem broke while being removed."
          )
        );
      } else if (removal?.failure) {
        ui.notifications?.warn?.(
          Constants.localize(
            "SCSockets.RemovalCheck.Notifications.Lost",
            "The check failed: the gem was destroyed while being removed."
          )
        );
      } else {
        ui.notifications?.info?.(
          Constants.localize("SCSockets.Notifications.GemUnsocketed", "Gem unsocketed.")
        );
      }
    }

    DebugTrace.log("socket-service.removeGem.done", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx
    });
    return SocketService.#buildResult({
      success: true,
      changed: true,
      reason: shouldBreakGem ? "gem-removed-broken" : removal?.failure ? "gem-lost" : "gem-removed",
      returnedGemItem,
      ...(removal?.removalCheck ? { removalCheck: removal.removalCheck } : {})
    });
  }

  static async #addSlot(hostItem, options = {}) {
    DebugTrace.log("socket-service.addSlot.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(hostItem?.actor ?? hostItem?.parent),
      options: DebugTrace.describeOptions(options)
    });
    const {
      ignoreMaxSockets = false,
      bypassPermission = false,
      bypassWorldSocketLimit = false,
      slotConfig = {}
    } = options;
    const canBypassWorldSocketLimit = ignoreMaxSockets || bypassWorldSocketLimit;

    if (!SocketService.#isHostTypeSocketable(hostItem)) {
      if (options?.notify !== false) {
        ui.notifications?.warn?.(
          Constants.localize(
            "SCSockets.Notifications.HostNotSocketable",
            "This item type cannot receive sockets."
          )
        );
      }
      return SocketService.#buildResult({
        success: false,
        changed: false,
        reason: "host-not-socketable"
      });
    }

    if (!bypassPermission && !ModuleSettings.canAddSlot()) {
      return SocketService.#buildResult({
        success: false,
        changed: false,
        reason: "permission-denied"
      });
    }
    const currentSlots = SocketStore.peekSlots(hostItem);
    const maxSlots = ModuleSettings.getMaxSockets();
    if (!canBypassWorldSocketLimit && currentSlots.length >= maxSlots) {
      if (options?.notify !== false) {
        ui.notifications?.warn?.(
          Constants.localize("SCSockets.Notifications.MaxReached", "Maximum number of sockets reached.")
        );
      }
      return SocketService.#buildResult({
        success: false,
        changed: false,
        reason: "max-sockets-reached"
      });
    }
    const slot = SocketSlot.makeDefault(slotConfig);
    const createdIndex = currentSlots.length;
    const updateOptions = SocketService.#buildInternalUpdateOptions({ render: false }, options);
    DebugTrace.log("socket-service.addSlot.noRender", {
      hostItem: DebugTrace.describeItem(hostItem),
      options: DebugTrace.describeOptions(updateOptions)
    });
    await SocketStore.addSlot(hostItem, slot, updateOptions);
    SocketService.#emitSocketAdded(hostItem, {
      slotIndex: createdIndex,
      slot,
      totalSlots: createdIndex + 1
    });
    DebugTrace.log("socket-service.addSlot.done", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: createdIndex
    });
    return SocketService.#buildResult({
      success: true,
      changed: true,
      reason: "slot-added",
      slotIndex: createdIndex,
      totalSlots: createdIndex + 1
    });
  }

  static async #removeSlot(hostItem, idx, options = {}) {
    DebugTrace.log("socket-service.removeSlot.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(hostItem?.actor ?? hostItem?.parent),
      slotIndex: idx,
      options: DebugTrace.describeOptions(options)
    });
    if (!SocketService.#canMutateSockets(options, ModuleSettings.SOCKET_ACTION_REMOVE_SLOT)) {
      return;
    }
    const currentSlots = SocketStore.peekSlots(hostItem);
    if (!Number.isInteger(idx) || idx < 0 || idx >= currentSlots.length) {
      return;
    }

    // Only empty slots go this way: a filled one has a gem to hand back and
    // effects to clean up, which is `removeSlotWithContents`' job.
    if (currentSlots[idx]?.gem || currentSlots[idx]?._gemData) {
      return SocketService.#buildResult({ success: false, changed: false, reason: "slot-not-empty" });
    }

    const removedSlot = foundry.utils.deepClone(currentSlots[idx] ?? null);
    const updateOptions = SocketService.#buildInternalUpdateOptions({ render: false }, options);
    DebugTrace.log("socket-service.removeSlot.noRender", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx,
      options: DebugTrace.describeOptions(updateOptions)
    });
    const result = await SocketStore.removeSlot(hostItem, idx, updateOptions);
    SocketService.#emitSocketRemoved(hostItem, {
      slotIndex: idx,
      slot: removedSlot,
      totalSlots: Math.max(currentSlots.length - 1, 0)
    });
    DebugTrace.log("socket-service.removeSlot.done", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx
    });
    return result;
  }

  static async #removeSlotWithContents(hostItem, idx, options = {}, removal = null) {
    hostItem = SocketService.#resolveHostItem(hostItem);
    const currentSlots = SocketStore.peekSlots(hostItem);
    if (!Number.isInteger(idx) || idx < 0 || idx >= currentSlots.length) {
      return SocketService.#buildResult({ success: false, changed: false, reason: "invalid-slot-index" });
    }

    // Checked before the gem is touched: a slot that cannot be removed must
    // not lose its gem on the way.
    if (!SocketService.#canMutateSockets(options, ModuleSettings.SOCKET_ACTION_REMOVE_SLOT)) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "permission-denied",
        Constants.localize(
          "SCSockets.Notifications.EditPermissionDenied",
          "You do not have permission to modify sockets on this item."
        )
      );
    }

    const hostState = SocketService.#captureHostState(hostItem);
    let removeGemResult = null;

    try {
      if (currentSlots[idx]?.gem || currentSlots[idx]?._gemData) {
        removeGemResult = await SocketService.#removeGem(hostItem, idx, options, removal);
        if (!removeGemResult?.success) {
          return removeGemResult;
        }
      } else {
        await SocketService.#removeDerivedSlotData(hostItem, idx, options);
      }

      hostItem = SocketService.#resolveHostItem(hostItem);
      return await SocketService.#removeSlot(hostItem, idx, options);
    } catch (error) {
      await SocketService.#rollbackHostOperation(hostItem, hostState, options, {
        returnedGemItem: removeGemResult?.returnedGemItem ?? removeGemResult?.data?.returnedGemItem ?? null
      });
      throw error;
    }
  }

  static async #updateSlotConfig(hostItem, idx, config, options = {}) {
    if (!options?.bypassPermission && !ModuleSettings.canConfigureSlots()) {
      if (options?.notify !== false) {
        ui.notifications?.warn?.(
          Constants.localize(
            "SCSockets.Notifications.EditPermissionDenied",
            "You do not have permission to modify sockets on this item."
          )
        );
      }
      return false;
    }

    // Visibility and the check overrides are the GM's to set: anyone
    // else keeps what the slot already has, whatever the config asks for.
    if (!options?.bypassPermission && !game?.user?.isGM) {
      const current = SocketSlotConfigService.getConfig(SocketSlotConfigService.getSlot(hostItem, idx) ?? {});
      config = { ...config };
      for (const key of SocketService.#GM_SLOT_CONFIG_KEYS) {
        config[key] = current[key];
      }
    }

    return SocketSlotConfigService.updateConfig(hostItem, idx, config, options);
  }

  static async #removeDerivedSlotData(hostItem, idx, options = {}) {
    const noRender = SocketService.#buildInternalUpdateOptions({ render: false }, options);

    try {
      await EffectService.removeGemEffects(hostItem, idx, noRender);
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] removeGemEffects failed during slot cleanup:`, error);
    }

    await ActivityTransferService.removeForSlot(hostItem, idx, noRender);
  }

  static #gemMatchesHostType(gemItem, hostItem) {
    if (!gemItem || !hostItem) {
      return false;
    }

    const allowed = gemItem.getFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ALLOWED_TYPES);
    if (!Array.isArray(allowed) || !allowed.length) {
      return true;
    }

    if (allowed.includes(Constants.GEM_ALLOWED_TYPES_ALL)) {
      return true;
    }

    const hostKeys = SocketService.#resolveHostTypeKeys(hostItem);
    return hostKeys.some((key) => allowed.includes(key));
  }

  static #resolveHostTypeKeys(hostItem) {
    const keys = new Set();
    if (!hostItem) {
      return Array.from(keys);
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
      if (value) {
        const normalized = typeof value === "string" ? value : String(value);
        keys.add(`${type}:${normalized}`);
      }
    }

    if (type) {
      keys.add(type);
    }

    return Array.from(keys);
  }

  static #canUseSocketsOnHost(hostItem) {
    return ModuleSettings.isItemSocketable(hostItem);
  }

  static #isHostTypeSocketable(hostItem) {
    return ModuleSettings.isItemSocketableByType(hostItem);
  }

  /**
   * A gem taken out of an unidentified item is still unknown, so it goes back
   * to the inventory unidentified instead of revealing what the item held.
   */
  static #keepGemUnidentified(hostItem, gemData) {
    if (
      gemData
      && GemConcealmentService.isEnabled()
      && GemConcealmentService.isUnidentified(hostItem)
    ) {
      GemConcealmentService.markDataUnidentified(gemData);
    }
  }

  static #normalizeRemoveGemMode(mode) {
    const normalized = String(mode ?? SocketService.REMOVE_GEM_MODE_DEFAULT).trim().toLowerCase();
    if (normalized === SocketService.REMOVE_GEM_MODE_KEEP || normalized === SocketService.REMOVE_GEM_MODE_DELETE) {
      return normalized;
    }
    return SocketService.REMOVE_GEM_MODE_DEFAULT;
  }

  static #shouldDeleteGemOnRemoval(slot, { mode = SocketService.REMOVE_GEM_MODE_DEFAULT } = {}) {
    if (mode === SocketService.REMOVE_GEM_MODE_KEEP) {
      return false;
    }

    if (mode === SocketService.REMOVE_GEM_MODE_DELETE) {
      return true;
    }

    const slotDeleteOverride = SocketSlotConfigService.getConfig(slot).deleteGemOnRemoval;
    return slotDeleteOverride || ModuleSettings.shouldDeleteGemOnRemoval();
  }

  static #buildInternalUpdateOptions(base = {}, options = {}) {
    return {
      ...base,
      [Constants.MODULE_ID]: {
        ...(base?.[Constants.MODULE_ID] ?? {}),
        ...(options?.[Constants.MODULE_ID] ?? {}),
        [ActivityTransferService.UPDATE_OPTION_SKIP_RECONCILE]: true
      }
    };
  }

  static async #enqueueHostOperation(hostItem, operation) {
    const currentHostItem = SocketService.#resolveHostItem(hostItem);
    return HostOperationQueue.enqueue(
      currentHostItem,
      () => operation(SocketService.#resolveHostItem(currentHostItem))
    );
  }

  static #resolveHostItem(hostItem) {
    return ItemSheetSync.resolve(hostItem);
  }

  /** Whether the current user may perform every one of the given socket actions. */
  static #canMutateSockets(options = {}, ...actions) {
    return Boolean(options?.bypassPermission)
      || actions.every((action) => ModuleSettings.canPerformSocketAction(action));
  }

  static #buildResult({ success = false, changed = false, reason = "unknown", ...data } = {}) {
    return {
      success,
      changed,
      reason,
      data
    };
  }

  static #warnAndReturnResult(level, reason, message) {
    ui.notifications?.[level]?.(message);
    return SocketService.#buildResult({
      success: false,
      changed: false,
      reason,
      message
    });
  }

  static #captureHostState(hostItem) {
    const currentHostItem = SocketService.#resolveHostItem(hostItem);
    const source = currentHostItem?.toObject?.() ?? {};

    return {
      sockets: foundry.utils.deepClone(SocketStore.peekSlots(currentHostItem)),
      socketActivities: foundry.utils.deepClone(
        currentHostItem?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES) ?? null
      ),
      activities: foundry.utils.deepClone(source.system?.activities ?? {}),
      effects: (currentHostItem?.effects?.contents ?? []).map((effect) => {
        const data = effect.toObject();
        delete data._id;
        return data;
      })
    };
  }

  static async #rollbackHostOperation(hostItem, hostState, options = {}, {
    consumedIncomingGem = false,
    consumedIncomingSnapshot = null,
    returnedGemItem = null
  } = {}) {
    // The failed operation may already have shown its half-done state, so
    // the writes that undo it are rendered even when the operation was silent.
    const publish = { ...options, render: true };

    try {
      await SocketService.#restoreHostState(hostItem, hostState, options);
    } catch (restoreError) {
      console.error(`[${Constants.MODULE_ID}] failed to restore host item after socket error:`, restoreError);
    }

    if (returnedGemItem) {
      try {
        await InventoryService.consumeOne(returnedGemItem, publish);
      } catch (inventoryError) {
        console.warn(`[${Constants.MODULE_ID}] failed to revert returned gem after socket error:`, inventoryError);
      }
    }

    if (consumedIncomingGem && consumedIncomingSnapshot) {
      try {
        await InventoryService.returnOne(SocketService.#resolveHostItem(hostItem), consumedIncomingSnapshot, publish);
      } catch (inventoryError) {
        console.warn(`[${Constants.MODULE_ID}] failed to restore consumed gem after socket error:`, inventoryError);
      }
    }
  }

  static async #restoreHostState(hostItem, hostState, options = {}) {
    let currentHostItem = SocketService.#resolveHostItem(hostItem);
    if (!currentHostItem || !hostState) {
      return currentHostItem ?? null;
    }

    const effectIds = (currentHostItem?.effects?.contents ?? [])
      .map((effect) => effect?.id)
      .filter((id) => typeof id === "string" && id.length);
    if (effectIds.length) {
      await currentHostItem.deleteEmbeddedDocuments("ActiveEffect", effectIds, options);
    }

    if (Array.isArray(hostState.effects) && hostState.effects.length) {
      await currentHostItem.createEmbeddedDocuments(
        "ActiveEffect",
        hostState.effects.map((effect) => foundry.utils.deepClone(effect)),
        options
      );
    }

    // Written last and rendered: sheets get the restored sockets together with
    // the effects put back above.
    currentHostItem = await HostItemUpdateService.update(currentHostItem, {
      "system.activities": foundry.utils.deepClone(hostState.activities ?? {}),
      [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`]:
        foundry.utils.deepClone(hostState.socketActivities ?? {}),
      [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]:
        foundry.utils.deepClone(hostState.sockets ?? [])
    }, { ...options, render: true });

    return SocketService.#resolveHostItem(currentHostItem);
  }


  static #emitSocketAdded(hostItem, { slotIndex, slot, totalSlots }) {
    Hooks.callAll(Constants.HOOK_SOCKET_ADDED, {
      item: hostItem ?? null,
      itemId: hostItem?.id ?? null,
      itemUuid: hostItem?.uuid ?? null,
      actor: hostItem?.actor ?? null,
      actorId: hostItem?.actor?.id ?? null,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      slot: foundry.utils.deepClone(slot ?? null),
      totalSlots: Number.isInteger(totalSlots) ? totalSlots : null,
      userId: game.userId ?? game.user?.id ?? null
    });
  }

  static #emitSocketRemoved(hostItem, { slotIndex, slot, totalSlots }) {
    Hooks.callAll(Constants.HOOK_SOCKET_REMOVED, {
      item: hostItem ?? null,
      itemId: hostItem?.id ?? null,
      itemUuid: hostItem?.uuid ?? null,
      actor: hostItem?.actor ?? null,
      actorId: hostItem?.actor?.id ?? null,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      slot: foundry.utils.deepClone(slot ?? null),
      totalSlots: Number.isInteger(totalSlots) ? totalSlots : null,
      userId: game.userId ?? game.user?.id ?? null
    });
  }

}
