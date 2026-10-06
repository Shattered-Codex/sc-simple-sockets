import { Constants } from "../../core/Constants.js";
import { ItemResolver } from "../../core/ItemResolver.js";
import { ModuleSettings } from "../../core/settings/ModuleSettings.js";
import { SocketStore } from "../../core/SocketStore.js";
import { HostOperationQueue } from "../../core/support/HostOperationQueue.js";
import { HostItemUpdateService } from "../../core/support/HostItemUpdateService.js";

/**
 * Hides the identity of socketed gems from players while it should be unknown:
 * when the item holding the socket is unidentified, or when the gem itself was
 * unidentified when it was socketed.
 *
 * Nothing stored is changed. Players get a masked view (name, image and
 * description) and GMs always see the real gem, which mirrors how dnd5e treats
 * unidentified items. The gem's effects, damage and activities keep working.
 */
export class GemConcealmentService {
  static PLACEHOLDER_IMG = Constants.UNIDENTIFIED_GEM_IMG;

  static #wrapped = false;
  static #maskedDocuments = new WeakMap();

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
    if (!/"identified"\s*:\s*false/.test(encoded)) {
      return false;
    }
    return GemConcealmentService.isUnidentified(ItemResolver.expandSnapshot(snapshot));
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
   * Returns the slots with every unidentified gem snapshot identified, or null
   * when none needed it. Used when the item holding them is identified.
   */
  static identifySlots(slots) {
    if (!Array.isArray(slots)) {
      return null;
    }

    let changed = false;
    const next = slots.map((slot) => {
      if (!GemConcealmentService.isSnapshotUnidentified(slot?._gemData)) {
        return slot;
      }
      const source = ItemResolver.expandSnapshot(slot._gemData);
      if (!source?.system) {
        return slot;
      }
      source.system.identified = true;
      changed = true;
      return { ...slot, _gemData: ItemResolver.compactSnapshot(source) };
    });
    return changed ? next : null;
  }

  /** Reads and writes inside the socket queue so identification preserves pending edits. */
  static async identifyHostGems(item) {
    return HostOperationQueue.enqueue(item, async () => {
      const current = HostItemUpdateService.resolve(item);
      if (!current || GemConcealmentService.isUnidentified(current)) return;
      const slots = GemConcealmentService.identifySlots(SocketStore.peekSlots(current));
      if (slots) await SocketStore.setSlots(current, slots);
    });
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
    const activities = item?.system?.activities ?? [];
    const effects = item?.effects?.contents ?? item?.effects ?? [];
    const documents = [
      ...(typeof activities[Symbol.iterator] === "function" ? activities : Object.values(activities)),
      ...(typeof effects[Symbol.iterator] === "function" ? effects : Object.values(effects))
    ];
    for (const document of documents) {
      const previous = GemConcealmentService.#maskedDocuments.get(document);
      if (!previous) continue;
      if (document.name === previous.maskedName) document.name = previous.name;
      if (document.img === GemConcealmentService.PLACEHOLDER_IMG) document.img = previous.img;
      if (document.description === previous.maskedDescription) document.description = previous.description;
      GemConcealmentService.#maskedDocuments.delete(document);
    }
    // Restore any previous mask before checking whether concealment still applies.
    if (!user || user.isGM) {
      return;
    }
    const slots = item?.flags?.[Constants.MODULE_ID]?.[Constants.FLAGS.sockets];
    if (!Array.isArray(slots) || !slots.length || !GemConcealmentService.isEnabled()) {
      return;
    }

    const concealedSlots = new Set();
    slots.forEach((slot, index) => {
      if (GemConcealmentService.isSlotConcealed(item, slot, user)) {
        concealedSlots.add(index);
      }
    });
    if (!concealedSlots.size) {
      return;
    }

    const name = GemConcealmentService.placeholderName();
    const fromConcealedGem = (document) => concealedSlots.has(
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
      document.name = name;
      document.img = GemConcealmentService.PLACEHOLDER_IMG;
      document.description = maskedDescription;
    }
  }
}
