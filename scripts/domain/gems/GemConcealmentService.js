import { Constants } from "../../core/Constants.js";
import { ItemResolver } from "../../core/ItemResolver.js";
import { ModuleSettings } from "../../core/settings/ModuleSettings.js";
import { SocketStore } from "../../core/SocketStore.js";
import { HostOperationQueue } from "../../core/support/HostOperationQueue.js";
import { HostItemUpdateService } from "../../core/support/HostItemUpdateService.js";
import { GemCriteria } from "./GemCriteria.js";

/**
 * Hides the identity of gems from players while it should be unknown, both in
 * inventory and in sockets whose host or stored gem is unidentified.
 *
 * Nothing stored is changed. Players get a masked view (name, image and
 * description) and GMs always see the real gem, which mirrors how dnd5e treats
 * unidentified items. The gem's effects, damage and activities keep working.
 */
export class GemConcealmentService {
  static PLACEHOLDER_IMG = Constants.UNIDENTIFIED_GEM_IMG;

  static #wrapped = false;
  static #maskedDocuments = new WeakMap();
  /** Items holding at least one masked activity or effect. */
  static #maskedItems = new WeakSet();
  static #maskedGemImages = new WeakMap();
  /** Encoded snapshot -> whether it holds an unidentified gem. */
  static #snapshotCache = new Map();
  static #SNAPSHOT_CACHE_LIMIT = 500;

  static isEnabled() {
    return ModuleSettings.shouldConcealUnidentifiedGems();
  }

  /** Whether concealment applies to this user at all (never to a GM). */
  static appliesToUser(user = globalThis.game?.user) {
    return Boolean(user) && !user.isGM && GemConcealmentService.isEnabled();
  }

  static placeholderName() {
    return Constants.localize("SCSockets.UnidentifiedGem.Name", "Unidentified Gem");
  }

  static placeholderDescription() {
    return Constants.localize("SCSockets.UnidentifiedGem.Description", "This gem has not been identified.");
  }

  /** Accepts an Item document or plain item data. */
  static isUnidentified(itemOrData) {
    return itemOrData?.system?.identified === false;
  }

  /** An unknown inventory gem has no socket/source flags after extraction. */
  static isGemConcealed(item, user = globalThis.game?.user) {
    return GemConcealmentService.appliesToUser(user)
      && GemConcealmentService.isUnidentified(item)
      && GemCriteria.matches(item);
  }

  static #maskGemImage(item, concealed) {
    if (concealed) {
      if (!GemConcealmentService.#maskedGemImages.has(item) || item.img !== GemConcealmentService.PLACEHOLDER_IMG) {
        GemConcealmentService.#maskedGemImages.set(item, item._source?.img ?? item.img);
      }
      item.img = GemConcealmentService.PLACEHOLDER_IMG;
    } else if (GemConcealmentService.#maskedGemImages.has(item)) {
      if (item.img === GemConcealmentService.PLACEHOLDER_IMG) {
        item.img = item._source?.img ?? GemConcealmentService.#maskedGemImages.get(item);
      }
      GemConcealmentService.#maskedGemImages.delete(item);
    }
  }

  /**
   * Whether the stored gem was unidentified when socketed. The snapshot keeps
   * the item as a JSON string, so this looks for the field in the text and
   * only decodes the snapshot when it is actually there.
   */
  static isSnapshotUnidentified(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      return false;
    }
    if (snapshot.system) {
      return GemConcealmentService.isUnidentified(snapshot);
    }
    const encoded = typeof snapshot.data === "string" ? snapshot.data : "";
    if (!encoded.length) {
      return false;
    }
    // Item preparation asks this for every slot on every pass, so the answer
    // is kept per encoded snapshot instead of scanning the text again.
    const cache = GemConcealmentService.#snapshotCache;
    const cached = cache.get(encoded);
    if (cached !== undefined) {
      return cached;
    }
    const unidentified = /"identified"\s*:\s*false/.test(encoded)
      && GemConcealmentService.isUnidentified(ItemResolver.expandSnapshot(snapshot));
    if (cache.size >= GemConcealmentService.#SNAPSHOT_CACHE_LIMIT) {
      cache.clear();
    }
    cache.set(encoded, unidentified);
    return unidentified;
  }

  static isSlotConcealed(hostItem, slot, user = globalThis.game?.user) {
    if (!slot?.gem && !slot?._gemData) {
      return false;
    }
    if (!GemConcealmentService.appliesToUser(user)) {
      return false;
    }
    return GemConcealmentService.isUnidentified(hostItem)
      || GemConcealmentService.isSnapshotUnidentified(slot._gemData);
  }

  /**
   * An empty slot of an unidentified item keeps its custom name and
   * description from players: both tend to describe what the item is for.
   */
  static isEmptySlotConcealed(hostItem, slot, user = globalThis.game?.user) {
    if (!slot || slot.gem || slot._gemData) {
      return false;
    }
    return GemConcealmentService.appliesToUser(user) && GemConcealmentService.isUnidentified(hostItem);
  }

  /**
   * Returns the slot as this user may see it: the same object when nothing is
   * hidden, otherwise a copy with the gem's name and image replaced and
   * `concealed: true`. A custom slot name is replaced too, since slots are
   * often named after what they hold. The snapshot stays in place because charges and other
   * mechanics still read it; display code must check `concealed` before
   * showing anything taken from it.
   */
  static maskSlot(hostItem, slot, user = globalThis.game?.user) {
    if (GemConcealmentService.isEmptySlotConcealed(hostItem, slot, user)) {
      return {
        ...slot,
        name: Constants.localize("SCSockets.SocketEmptyName", "Empty"),
        img: Constants.SOCKET_SLOT_IMG,
        slotConfig: GemConcealmentService.#maskSlotConfig(slot)
      };
    }

    if (!GemConcealmentService.isSlotConcealed(hostItem, slot, user)) {
      return slot;
    }

    const name = GemConcealmentService.placeholderName();
    const img = GemConcealmentService.PLACEHOLDER_IMG;
    return {
      ...slot,
      concealed: true,
      name,
      img,
      slotConfig: GemConcealmentService.#maskSlotConfig(slot),
      gem: { ...(slot.gem ?? {}), name, img }
    };
  }

  static #maskSlotConfig(slot) {
    return { ...(slot.slotConfig ?? {}), name: "", description: "", condition: "", color: "", frameImg: "" };
  }

  static maskSlots(hostItem, slots, user = globalThis.game?.user) {
    if (!Array.isArray(slots) || !GemConcealmentService.appliesToUser(user)) {
      return slots;
    }
    return slots.map((slot) => GemConcealmentService.maskSlot(hostItem, slot, user));
  }

  /** Display name and image for a gem shown outside of a slot list. */
  static describeGem(hostItem, slot, gem, user = globalThis.game?.user) {
    if (GemConcealmentService.isSlotConcealed(hostItem, slot, user)) {
      return { name: GemConcealmentService.placeholderName(), img: GemConcealmentService.PLACEHOLDER_IMG };
    }
    return { name: gem?.name ?? slot?.name, img: gem?.img ?? slot?.img };
  }

  // ---------------------------------------------------------------------------
  // Unidentified gems leaving a socket / hosts being identified
  // ---------------------------------------------------------------------------

  /**
   * Marks gem data as unidentified, in place, before it returns to an
   * inventory: a gem pulled out of an unidentified item is still unknown.
   */
  static markDataUnidentified(data) {
    if (!data || typeof data !== "object") {
      return data;
    }
    data.system ??= {};
    data.system.identified = false;
    data.system.unidentified ??= {};
    if (!String(data.system.unidentified.name ?? "").trim().length) {
      data.system.unidentified.name = GemConcealmentService.placeholderName();
    }
    return data;
  }

  /**
   * Identifies gem snapshots and restores cached identity from source data,
   * including slots previously saved with an unidentified alias. Returns null
   * when nothing needs updating.
   */
  static #slotSources(slots) {
    return new Map((Array.isArray(slots) ? slots : []).map((slot, index) => [index, ItemResolver.expandSnapshot(slot?._gemData)]));
  }

  /** Recognize old localized masks, but never replace a known original name. */
  static isPlaceholderName(name, gem, originalName = gem?.name) {
    if (name && name === originalName) return false;
    // Both shipped translations can exist in saved data regardless of client language.
    return !name || new Set([this.placeholderName(), "Unidentified Gem", "Gema não identificada",
      gem?.system?.unidentified?.name]).has(name);
  }

  static identifySlots(slots, sources = this.#slotSources(slots)) {
    if (!Array.isArray(slots)) {
      return null;
    }

    let changed = false;
    const next = slots.map((slot, index) => {
      const source = sources.get(index);
      if (!source?.system) {
        return slot;
      }
      const maskedName = (name) => this.isPlaceholderName(name, source);
      const name = maskedName(slot.gem?.name) ? source.name || slot.gem?.name : slot.gem.name;
      const img = !slot.gem?.img || slot.gem.img === this.PLACEHOLDER_IMG
        ? source.img || slot.gem?.img : slot.gem.img;
      const slotName = slot.slotConfig?.name || (maskedName(slot.name) ? name : slot.name);
      const slotImg = !slot.img || slot.img === this.PLACEHOLDER_IMG ? img : slot.img;
      if (!GemConcealmentService.isUnidentified(source)
        && slot.gem?.name === name && slot.gem?.img === img
        && slot.name === slotName && slot.img === slotImg) {
        return slot;
      }
      source.system.identified = true;
      changed = true;
      return {
        ...slot,
        name: slotName,
        img: slotImg,
        gem: { ...slot.gem, name, img },
        _gemData: ItemResolver.compactSnapshot(source)
      };
    });
    return changed ? next : null;
  }

  /** Reads and writes inside the socket queue so identification preserves pending edits. */
  static async identifyHostGems(item) {
    return HostOperationQueue.enqueue(item, async () => {
      const current = HostItemUpdateService.resolve(item);
      if (!current || GemConcealmentService.isUnidentified(current)) return;
      const storedSlots = SocketStore.peekSlots(current);
      const sources = this.#slotSources(storedSlots);
      const slots = this.identifySlots(storedSlots, sources);
      const { updates, effects } = this.#repairStoredIdentity(current, sources);
      if (slots) updates[`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`] =
        ItemResolver.normalizeSocketSlots(foundry.utils.deepClone(slots));
      const hasUpdate = Object.keys(updates).length > 0;
      // Preserve the embedded-effect lifecycle; the final parent update renders
      // slots and cached identity together. No partial slot write precedes repair.
      if (effects.length) await current.updateEmbeddedDocuments("ActiveEffect", effects, { render: !hasUpdate });
      if (hasUpdate) await HostItemUpdateService.update(current, updates);
    });
  }

  /** Build a repair patch without writing or parsing a snapshot more than once. */
  static #repairStoredIdentity(item, sources) {
    const source = item?.toObject?.();
    const updates = {};
    if (!source) return { updates, effects: [] };
    const grants = source.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOCKET_ACTIVITIES] ?? {};
    for (const [index, grant] of Object.entries(grants)) {
      const gem = sources.get(Number(index));
      if (!gem || !grant || typeof grant !== "object") continue;
      const prefix = `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}.${index}`;
      for (const [path, cached] of [[prefix, grant], ...Object.entries(grant.activityMeta ?? {})
        .map(([id, meta]) => [`${prefix}.activityMeta.${id}`, meta])]) {
        if (!cached || typeof cached !== "object") continue;
        if (gem.name && cached.gemName !== gem.name) updates[`${path}.gemName`] = gem.name;
        if (gem.img && cached.gemImg !== gem.img) updates[`${path}.gemImg`] = gem.img;
      }
    }

    const effects = [];
    for (const effect of source.effects ?? []) {
      if (!effect?._id) continue;
      const origin = effect.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM];
      const gem = origin?.slot == null ? null : sources.get(Number(origin.slot));
      if (!gem) continue;
      const original = gem.effects?.find((entry) => entry?._id === origin.sourceId);
      const patch = { _id: effect._id };
      if (this.isPlaceholderName(effect.name, gem, original?.name || gem.name)) {
        if (original?.name || gem.name) patch.name = original?.name || gem.name;
      }
      const img = original?.img || gem.img;
      if (effect.img === this.PLACEHOLDER_IMG && img && img !== effect.img) patch.img = img;
      if (Object.keys(patch).length > 1) effects.push(patch);
    }
    return { updates, effects };
  }

  /** A setting change must update prepared content as well as rendered sheets. */
  static refreshPreparedContent() {
    for (const item of game.items ?? []) GemConcealmentService.maskTransferredContent(item);
    const actors = new Set(game.actors ?? []);
    for (const scene of game.scenes ?? []) {
      for (const token of scene.tokens ?? []) {
        if (token.actor) actors.add(token.actor);
      }
    }
    for (const actor of actors) {
      for (const item of actor.items ?? []) GemConcealmentService.maskTransferredContent(item);
    }
    globalThis.Hooks?.callAll?.(`${Constants.MODULE_ID}.concealmentChanged`);
  }

  // ---------------------------------------------------------------------------
  // Activities and effects granted by a concealed gem
  // ---------------------------------------------------------------------------

  /**
   * Masks, on a player's client, the prepared name and image of the activities
   * and effects a concealed gem transferred to its host item. Only prepared
   * data is touched (never the source), so sheets, the activity picker and
   * chat cards show the placeholder while the stored data keeps the real one.
   */
  static activate() {
    if (GemConcealmentService.#wrapped || game?.system?.id !== "dnd5e") {
      return;
    }

    const ItemClass = globalThis.dnd5e?.documents?.Item5e ?? globalThis.CONFIG?.Item?.documentClass;
    const original = ItemClass?.prototype?.prepareData;
    if (typeof original !== "function") {
      return;
    }

    const mask = function (wrapped, ...args) {
      const result = wrapped.call(this, ...args);
      try {
        GemConcealmentService.maskTransferredContent(this);
      } catch (error) {
        console.error(`[${Constants.MODULE_ID}] failed to conceal gem content:`, error);
      }
      return result;
    };

    if (globalThis.libWrapper?.register && globalThis.dnd5e?.documents?.Item5e) {
      libWrapper.register(Constants.MODULE_ID, "dnd5e.documents.Item5e.prototype.prepareData", mask, "WRAPPER");
    } else {
      ItemClass.prototype.prepareData = function (...args) {
        return mask.call(this, original, ...args);
      };
    }
    GemConcealmentService.#wrapped = true;
  }

  static maskTransferredContent(item, user = globalThis.game?.user) {
    const standalone = GemConcealmentService.isGemConcealed(item, user);
    GemConcealmentService.#maskGemImage(item, standalone);
    // This runs on every item preparation for every user, so the common cases
    // (a GM, an item without sockets, nothing concealed) leave before any work.
    const wasMasked = GemConcealmentService.#maskedItems.has(item);
    const slots = user && !user.isGM
      ? item?.flags?.[Constants.MODULE_ID]?.[Constants.FLAGS.sockets]
      : null;
    const concealedSlots = new Set();
    if (Array.isArray(slots) && slots.length && GemConcealmentService.isEnabled()) {
      const hostUnidentified = GemConcealmentService.isUnidentified(item);
      slots.forEach((slot, index) => {
        if (!slot?.gem && !slot?._gemData) return;
        if (hostUnidentified || GemConcealmentService.isSnapshotUnidentified(slot._gemData)) {
          concealedSlots.add(index);
        }
      });
    }
    if (!wasMasked && !standalone && !concealedSlots.size) {
      return;
    }

    const activities = item?.system?.activities ?? [];
    const effects = item?.effects?.contents ?? item?.effects ?? [];
    const documents = [
      ...(typeof activities[Symbol.iterator] === "function" ? activities : Object.values(activities)),
      ...(typeof effects[Symbol.iterator] === "function" ? effects : Object.values(effects))
    ];

    // Restore any previous mask before applying the current one.
    if (wasMasked) {
      for (const document of documents) {
        const previous = GemConcealmentService.#maskedDocuments.get(document);
        if (!previous) continue;
        if (document.name === previous.maskedName) document.name = previous.name;
        if (document.img === GemConcealmentService.PLACEHOLDER_IMG) document.img = previous.img;
        if (document.description === previous.maskedDescription) document.description = previous.description;
        GemConcealmentService.#maskedDocuments.delete(document);
      }
      GemConcealmentService.#maskedItems.delete(item);
    }
    if (!standalone && !concealedSlots.size) {
      return;
    }

    const name = GemConcealmentService.placeholderName();
    const fromConcealedGem = (document) => standalone || concealedSlots.has(
      Number(document?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM]?.slot)
    );

    for (const document of documents) {
      if (!fromConcealedGem(document)) continue;
      const description = document.description;
      const maskedDescription = description && typeof description === "object"
        ? { ...description, chatFlavor: "" }
        : "";
      GemConcealmentService.#maskedDocuments.set(document, {
        name: document.name,
        img: document.img,
        description,
        maskedName: name,
        maskedDescription
      });
      GemConcealmentService.#maskedItems.add(item);
      document.name = name;
      document.img = GemConcealmentService.PLACEHOLDER_IMG;
      document.description = maskedDescription;
    }
  }
}
