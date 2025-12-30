export class Constants {
  static MODULE_ID = "sc-simple-sockets";
  static ITEM_TYPE_LOOT = "loot";
  static ITEM_SUBTYPE_GEM = "gem";
  static FLAG_STASH = "stashedEffects";
  static FLAG_SOURCE_GEM = "sourceGem";
  static FLAG_ACTIVITY_STASH = "stashedActivities";
  static FLAG_SOCKET_ACTIVITIES = "socketActivities";
  static FLAG_GEM_ALLOWED_TYPES = "gemAllowedTypes";
  static FLAG_GEM_DETAIL_TYPE = "gemDetailType";
  static FLAG_GEM_DAMAGE = "gemDamage";
  static FLAG_GEM_CRIT_THRESHOLD = "gemCritThreshold";
  static FLAG_GEM_CRIT_MULTIPLIER = "gemCritMultiplier";
  static FLAG_GEM_ATTACK_BONUS = "gemAttackBonus";
  static FLAGS = {
    sockets: "sockets",
    gemAllowedTypes: "gemAllowedTypes",
    gemDetailType: "gemDetailType",
    gemDamage: "gemDamage",
    gemCritThreshold: "gemCritThreshold",
    gemCritMultiplier: "gemCritMultiplier",
    gemAttackBonus: "gemAttackBonus"
  };
  static GEM_ALLOWED_TYPES_ALL = "*";
  static SOCKET_SLOT_IMG = `modules/${this.MODULE_ID}/assets/imgs/socket-slot.webp`;
  static SETTING_GEM_LOOT_SUBTYPES = "gemLootSubtypes";
  static SETTING_LOOT_SUBTYPE_MENU = "gemLootSubtypeSettings";
  static SETTING_CUSTOM_LOOT_SUBTYPES = "customLootSubtypes";

  static localize(key, fallback = key) {
    const i18n = game?.i18n;
    const localized = typeof i18n?.localize === "function" ? i18n.localize(key) : undefined;
    const hasTranslation = typeof i18n?.has === "function" ? i18n.has(key, { strict: true }) : false;

    if (hasTranslation && localized && localized !== key) {
      return localized;
    }

    // If the translation is missing, fall back to the provided default instead of showing the raw key.
    if (localized && localized !== key) {
      return localized;
    }

    return fallback ?? key;
  }
}
