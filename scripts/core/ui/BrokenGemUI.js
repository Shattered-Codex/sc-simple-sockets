import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { GemBreakService } from "../../domain/gems/GemBreakService.js";

/**
 * Marks broken gems in the UI — a cracked overlay drawn over the gem artwork on
 * actor inventories, the Items sidebar and the gem's own sheet — and gives the
 * GM the actions to break or repair a gem by hand.
 *
 * The overlay is a sibling element positioned over the existing image, so the
 * item's stored `img` is never changed.
 */
export class BrokenGemUI {
  static OVERLAY_CLASS = "sc-sockets-broken-overlay";
  static HOST_CLASS = "sc-sockets-broken-host";
  static IMAGE_CLASS = "sc-sockets-broken-image";

  static BOX_CLASS = "sc-sockets-broken-box";

  static #activated = false;
  static #observers = new WeakMap();
  /** Tracked roots: element -> { collect, observer, frame, count }. */
  static #roots = new Map();

  static activate() {
    if (BrokenGemUI.#activated) {
      return;
    }
    BrokenGemUI.#activated = true;

    for (const hook of ["renderActorSheet5e", "renderBaseActorSheet", "renderActorSheetV2", "renderActorSheet"]) {
      Hooks.on(hook, (sheet, html) => BrokenGemUI.render(sheet, html));
    }
    for (const hook of ["renderItemSheet5e", "renderItemSheetV2", "renderItemSheet"]) {
      Hooks.on(hook, (sheet, html) => BrokenGemUI.renderItemSheet(sheet, html));
    }
    Hooks.on("renderItemDirectory", (directory, html) => BrokenGemUI.renderDirectory(directory, html));
    for (const hook of ["closeApplicationV2", "closeActorSheet", "closeItemSheet", "closeItemDirectory"]) {
      Hooks.on(hook, (app) => {
        const element = BrokenGemUI.#rootOf(app?.element);
        for (const [root, state] of BrokenGemUI.#roots) {
          if (root === element || element?.contains?.(root) || !root.isConnected) {
            BrokenGemUI.#untrack(root, state);
          }
        }
      });
    }

    // The broken flag changes no markup by itself, so lists that do not
    // re-render on a flag update (the sidebar, reactive sheets) are refreshed here.
    Hooks.on("updateItem", (_item, changes) => {
      if (changes?.flags?.[Constants.MODULE_ID] !== undefined) {
        BrokenGemUI.#scheduleAll();
      }
    });

    Hooks.on("dnd5e.getItemContextOptions", (item, menuItems) => {
      BrokenGemUI.#addContextOptions(item, menuItems);
    });
    Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
      BrokenGemUI.#addHeaderControls(app, controls);
    });
  }

  /** Marks every broken gem listed on an actor sheet (inventory, favorites…). */
  static render(sheet, html) {
    const actor = sheet?.actor;
    const root = BrokenGemUI.#rootOf(html) ?? BrokenGemUI.#rootOf(sheet?.element);
    if (!actor || !root) {
      return;
    }

    BrokenGemUI.#track(root, () => BrokenGemUI.#collectRows(root, actor.items, "data-item-id"));
  }

  /** Marks the portrait of a broken gem's own sheet. */
  static renderItemSheet(sheet, html) {
    const item = sheet?.item ?? sheet?.document;
    const root = BrokenGemUI.#rootOf(html) ?? BrokenGemUI.#rootOf(sheet?.element);
    if (item?.documentName !== "Item" || !root) {
      return;
    }

    BrokenGemUI.#track(root, () => (
      GemBreakService.isBroken(item) ? [{ container: root, item, strict: true }] : []
    ));
  }

  /** Marks broken gems in the Items sidebar directory. */
  static renderDirectory(directory, html) {
    const root = BrokenGemUI.#rootOf(html) ?? BrokenGemUI.#rootOf(directory?.element);
    if (!root) {
      return;
    }

    BrokenGemUI.#track(root, () => BrokenGemUI.#collectRows(root, game.items ?? [], "data-entry-id"));
  }

  static #collectRows(root, items, attribute) {
    const entries = [];
    for (const item of items) {
      if (!GemBreakService.isBroken(item)) {
        continue;
      }
      for (const container of root.querySelectorAll(`[${attribute}="${CSS.escape(item.id)}"]`)) {
        entries.push({ container, item, strict: false });
      }
    }
    return entries;
  }

  /**
   * Keeps a root decorated. Sheets built on reactive frameworks (Tidy) and
   * lazily rendered tabs add their rows after the render hook, so a mutation
   * observer re-runs the pass; it only reacts to added or removed nodes and is
   * coalesced to one pass per animation frame.
   */
  static #track(root, collect) {
    let state = BrokenGemUI.#roots.get(root);
    if (!state) {
      state = { collect, observer: null, frame: 0, count: 0 };
      if (typeof MutationObserver === "function") {
        state.observer = new MutationObserver(() => BrokenGemUI.#schedule(root));
        state.observer.observe(root, { childList: true, subtree: true });
      }
      BrokenGemUI.#roots.set(root, state);
    }
    state.collect = collect;
    BrokenGemUI.#reconcile(root, state);
  }

  static #schedule(root) {
    const state = BrokenGemUI.#roots.get(root);
    if (!state || state.frame) {
      return;
    }
    state.frame = requestAnimationFrame(() => {
      state.frame = 0;
      if (!root.isConnected) {
        BrokenGemUI.#untrack(root, state);
        return;
      }
      BrokenGemUI.#reconcile(root, state);
    });
  }

  static #scheduleAll() {
    for (const [root, state] of BrokenGemUI.#roots) {
      if (root.isConnected) {
        BrokenGemUI.#schedule(root);
      } else {
        BrokenGemUI.#untrack(root, state);
      }
    }
  }

  static #untrack(root, state) {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.observer?.disconnect();
    for (const overlay of root.querySelectorAll(`.${BrokenGemUI.OVERLAY_CLASS}`)) {
      BrokenGemUI.#removeOverlay(overlay);
    }
    BrokenGemUI.#roots.delete(root);
  }

  /**
   * Brings the DOM in line with the current broken gems. It changes nothing
   * when the markers are already right, which is what keeps the mutation
   * observer from feeding itself.
   */
  static #reconcile(root, state) {
    const wanted = new Set();
    for (const { container, item, strict } of state.collect()) {
      const target = BrokenGemUI.#findTarget(container, item, strict);
      if (target) {
        wanted.add(target);
      }
    }

    // Nothing to mark and nothing marked: the common case, with no DOM access.
    if (!wanted.size && !state.count) {
      return;
    }

    for (const overlay of root.querySelectorAll(`.${BrokenGemUI.OVERLAY_CLASS}`)) {
      if (!wanted.has(overlay.previousElementSibling)) {
        BrokenGemUI.#removeOverlay(overlay);
      }
    }
    for (const box of root.querySelectorAll(`.${BrokenGemUI.BOX_CLASS}`)) {
      if (!wanted.has(box)) {
        box.classList.remove(BrokenGemUI.BOX_CLASS);
      }
    }
    for (const target of wanted) {
      BrokenGemUI.#decorate(target);
    }
    state.count = wanted.size;
  }

  /**
   * The element showing the gem artwork inside a row or sheet: normally an
   * <img>, but some sheets (Tidy classic) paint it as a background image.
   */
  static #findTarget(container, item, strict) {
    const images = Array.from(container?.querySelectorAll?.("img") ?? [])
      .filter((img) => !img.classList.contains(BrokenGemUI.OVERLAY_CLASS));
    const matching = images.find((img) => img.getAttribute("src") === item.img);
    if (matching || strict) {
      return matching ?? null;
    }
    return images.find((img) => img.classList.contains("item-image") || img.classList.contains("thumbnail"))
      ?? container.querySelector?.(".item-image")
      ?? images[0]
      ?? null;
  }

  static #decorate(target) {
    if (target.tagName !== "IMG") {
      target.classList.add(BrokenGemUI.BOX_CLASS);
      return;
    }

    const parent = target.parentElement;
    if (!parent) {
      return;
    }
    target.classList.add(BrokenGemUI.IMAGE_CLASS);
    if (target.nextElementSibling?.classList.contains(BrokenGemUI.OVERLAY_CLASS)) {
      return;
    }

    const overlay = document.createElement("img");
    overlay.className = BrokenGemUI.OVERLAY_CLASS;
    overlay.src = Constants.BROKEN_GEM_OVERLAY_IMG;
    overlay.alt = "";
    overlay.setAttribute("aria-hidden", "true");

    // Only a statically positioned parent needs to become the overlay's
    // containing block; an already positioned one is left untouched.
    if (globalThis.getComputedStyle?.(parent)?.position === "static") {
      parent.classList.add(BrokenGemUI.HOST_CLASS);
    }
    target.insertAdjacentElement("afterend", overlay);

    // The overlay copies the image box. A ResizeObserver keeps it aligned when
    // the image only gets its size later (hidden tab) or is resized.
    const sync = () => {
      overlay.style.left = `${target.offsetLeft}px`;
      overlay.style.top = `${target.offsetTop}px`;
      overlay.style.width = `${target.offsetWidth}px`;
      overlay.style.height = `${target.offsetHeight}px`;
    };
    sync();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(sync);
      observer.observe(target);
      observer.observe(parent);
      BrokenGemUI.#observers.set(overlay, observer);
    }
  }

  static #removeOverlay(overlay) {
    BrokenGemUI.#observers.get(overlay)?.disconnect();
    BrokenGemUI.#observers.delete(overlay);
    const parent = overlay.parentElement;
    overlay.previousElementSibling?.classList.remove(BrokenGemUI.IMAGE_CLASS);
    overlay.remove();
    if (parent && !parent.querySelector(`:scope > .${BrokenGemUI.OVERLAY_CLASS}`)) {
      parent.classList.remove(BrokenGemUI.HOST_CLASS);
    }
  }

  static #rootOf(html) {
    if (!html) return null;
    if (html.jquery || typeof html.get === "function") return html[0] ?? html.get(0) ?? null;
    return typeof html.querySelectorAll === "function" ? html : null;
  }

  // ---------------------------------------------------------------------------
  // GM actions
  // ---------------------------------------------------------------------------

  static #canToggle(item) {
    return Boolean(game.user?.isGM) && item?.documentName === "Item"
      && !item[Constants.PROP_SOCKET_SOURCE] && GemCriteria.matches(item);
  }

  static async #toggle(item) {
    if (GemBreakService.isBroken(item)) {
      await GemBreakService.repair(item);
      ui.notifications?.info?.(
        game.i18n?.format?.("SCSockets.BrokenGem.Notifications.Repaired", { name: item.name })
          ?? `${item.name} was repaired.`
      );
      return;
    }

    await GemBreakService.break(item);
    ui.notifications?.info?.(
      game.i18n?.format?.("SCSockets.BrokenGem.Notifications.Broken", { name: item.name })
        ?? `${item.name} is now broken.`
    );
  }

  static #actionLabel(item) {
    return GemBreakService.isBroken(item)
      ? Constants.localize("SCSockets.BrokenGem.Actions.Repair", "Repair gem")
      : Constants.localize("SCSockets.BrokenGem.Actions.Break", "Mark gem as broken");
  }

  static #actionIcon(item) {
    return GemBreakService.isBroken(item) ? "fa-solid fa-screwdriver-wrench" : "fa-solid fa-gem";
  }

  static #addContextOptions(item, menuItems) {
    if (!Array.isArray(menuItems) || !BrokenGemUI.#canToggle(item)) {
      return;
    }
    menuItems.push({
      name: BrokenGemUI.#actionLabel(item),
      icon: `<i class="${BrokenGemUI.#actionIcon(item)} fa-fw"></i>`,
      callback: () => BrokenGemUI.#toggle(item),
      group: "state"
    });
  }

  static #addHeaderControls(app, controls) {
    const item = app?.document ?? app?.item;
    if (!Array.isArray(controls) || !BrokenGemUI.#canToggle(item) || !item.isOwner) {
      return;
    }
    // Header controls are built once per window, so the label cannot follow
    // the gem's state the way the context menu entry does.
    controls.push({
      action: "scSocketsToggleBrokenGem",
      icon: "fa-solid fa-screwdriver-wrench",
      label: Constants.localize("SCSockets.BrokenGem.Actions.Toggle", "Break or repair gem"),
      onClick: () => BrokenGemUI.#toggle(item)
    });
  }
}
