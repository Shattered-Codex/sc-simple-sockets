export class Constants {
  static MODULE_ID = "sc-simple-sockets";
  static ITEM_TYPE_LOOT = "loot";
  static ITEM_SUBTYPE_GEM = "gem";
  static FLAG_STASH = "stashedEffects";
  static FLAG_SOURCE_GEM = "sourceGem";
  static FLAG_ACTIVITY_STASH = "stashedActivities";
  static FLAG_ACTIVITY_PENDING = "pendingActivityMigration";
  static FLAG_SOCKET_ACTIVITIES = "socketActivities";
  static FLAGS = { sockets: "sockets" };
  static SOCKET_SLOT_IMG = `modules/${this.MODULE_ID}/assets/imgs/socket-slot.webp`;

  static localize(key, fallback = key) {
    return game?.i18n?.localize?.(key) ?? fallback ?? key;
  }
}
