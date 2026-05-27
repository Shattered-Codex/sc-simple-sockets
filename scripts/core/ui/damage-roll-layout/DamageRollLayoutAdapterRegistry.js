import { Constants } from "../../Constants.js";
import { GemDamageRollLayoutAdapter } from "./GemDamageRollLayoutAdapter.js";
import { GemTypeDamageRollLayoutAdapter } from "./GemTypeDamageRollLayoutAdapter.js";
import { TypeBadgesDamageRollLayoutAdapter } from "./TypeBadgesDamageRollLayoutAdapter.js";
import { TypeDamageRollLayoutAdapter } from "./TypeDamageRollLayoutAdapter.js";

export class DamageRollLayoutAdapterRegistry {
  static MODE_GEM = "gem";
  static MODE_TYPE = "type";
  static MODE_GEM_TYPE = "gem-type";
  static MODE_TYPE_BADGES = "type-badges";

  static getDefaultMode() {
    return DamageRollLayoutAdapterRegistry.MODE_GEM;
  }

  static normalizeMode(value) {
    if (value === true) return DamageRollLayoutAdapterRegistry.MODE_GEM;
    if (value === false) return DamageRollLayoutAdapterRegistry.MODE_TYPE;

    const normalized = String(value ?? "").trim().toLowerCase();
    return DamageRollLayoutAdapterRegistry.getAvailableModes().includes(normalized)
      ? normalized
      : DamageRollLayoutAdapterRegistry.getDefaultMode();
  }

  static getAvailableModes() {
    return [
      DamageRollLayoutAdapterRegistry.MODE_GEM,
      DamageRollLayoutAdapterRegistry.MODE_TYPE,
      DamageRollLayoutAdapterRegistry.MODE_GEM_TYPE,
      DamageRollLayoutAdapterRegistry.MODE_TYPE_BADGES
    ];
  }

  static getSettingsChoices() {
    return [
      {
        value: DamageRollLayoutAdapterRegistry.MODE_GEM,
        label: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Options.Gem.Label",
          "Group by gem"
        ),
        description: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Options.Gem.Description",
          "Each socketed gem keeps its own block and shows only the damage rows that came from that specific gem."
        )
      },
      {
        value: DamageRollLayoutAdapterRegistry.MODE_TYPE,
        label: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Options.Type.Label",
          "Group by damage type"
        ),
        description: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Options.Type.Description",
          "All rows are merged by damage type, regardless of which gem or item created them."
        )
      },
      {
        value: DamageRollLayoutAdapterRegistry.MODE_GEM_TYPE,
        label: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Options.GemType.Label",
          "Group by gem type"
        ),
        description: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Options.GemType.Description",
          "Identical gems are merged into one block. The title shows 2x, 3x, and so on when more than one copy contributes."
        )
      },
      {
        value: DamageRollLayoutAdapterRegistry.MODE_TYPE_BADGES,
        label: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Options.TypeBadges.Label",
          "Group by damage type with badges"
        ),
        description: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Options.TypeBadges.Description",
          "All rows are merged by damage type and each result shows badges for the gems, plus the host item when its own damage is part of that type."
        )
      }
    ];
  }

  static getSettingsChoice(mode) {
    const normalized = DamageRollLayoutAdapterRegistry.normalizeMode(mode);
    return DamageRollLayoutAdapterRegistry.getSettingsChoices().find((choice) => choice.value === normalized)
      ?? DamageRollLayoutAdapterRegistry.getSettingsChoices()[0];
  }

  static createAdapter(mode) {
    switch (DamageRollLayoutAdapterRegistry.normalizeMode(mode)) {
      case DamageRollLayoutAdapterRegistry.MODE_TYPE:
        return new TypeDamageRollLayoutAdapter();
      case DamageRollLayoutAdapterRegistry.MODE_GEM_TYPE:
        return new GemTypeDamageRollLayoutAdapter();
      case DamageRollLayoutAdapterRegistry.MODE_TYPE_BADGES:
        return new TypeBadgesDamageRollLayoutAdapter();
      case DamageRollLayoutAdapterRegistry.MODE_GEM:
      default:
        return new GemDamageRollLayoutAdapter();
    }
  }
}
