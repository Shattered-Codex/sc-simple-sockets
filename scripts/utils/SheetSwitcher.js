import { MODULE_ID } from "../main.js";

export class SheetSwitcher {
  static FLAG_APPLIED = "appliedSheet";
  static SHEET_ID = "gb-socket-items.GemstoneItemSheet";

  static wasApplied(item) {
    return !!item.getFlag(MODULE_ID, this.FLAG_APPLIED);
  }

  static async apply(item) {
    const current = item.getFlag("core", "sheetClass");
    if (current !== this.SHEET_ID) {
      await item.setFlag("core", "sheetClass", this.SHEET_ID);
    }
    await item.setFlag(MODULE_ID, this.FLAG_APPLIED, true);
  }

  static async remove(item) {
    // remove TODOS os AEs do item; troque por filtro se quiser só marcados
    const ids = item.effects.map(e => e.id);
    if (ids.length) await item.deleteEmbeddedDocuments("ActiveEffect", ids);

    await item.unsetFlag("core", "sheetClass");            // volta pro sheet padrão do system
    await item.unsetFlag(MODULE_ID, this.FLAG_APPLIED);  // marca que removemos
  }

  static async removeEffects(item) {
    const ids = item.effects.map(e => e.id);
    if (ids.length) await item.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}
