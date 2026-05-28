import { Constants } from "../Constants.js";

const PATREON_URL = "https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=foundry_module&utm_campaign=support_popup";
const DISCORD_URL = "https://discord.gg/6mWCQEJEwG";
const FEATURE_REQUEST_URL = "https://github.com/Shattered-Codex/sc-simple-sockets/issues";

const CATALOG_ENTRIES = [
  {
    id: "setforge",
    name: "SC - Setforge",
    status: "Patreon",
    eyebrow: "SET BONUSES • PROGRESSION",
    description: "Create equipment sets with scalable bonuses, thresholds, and module-driven progression.",
    url: "https://wiki.shattered-codex.com/modules/sc-setforge",
    image: "modules/sc-simple-sockets/assets/support/carousel/setforge.webp",
    tone: "gold"
  },
  {
    id: "runeword",
    name: "SC - Runeword",
    status: "Patreon",
    eyebrow: "RUNE COMBINATIONS • LOOT CHASE",
    description: "Build runeword combinations with slot order, recipe logic, and unique rewards.",
    url: "https://wiki.shattered-codex.com/modules/sc-runeword",
    image: "modules/sc-simple-sockets/assets/support/carousel/runeword.webp",
    tone: "ember"
  },
  {
    id: "ascendant-items",
    name: "SC - Ascendant Items",
    status: "Patreon",
    eyebrow: "EVOLVING LOOT • LONG-TERM GEAR",
    description: "Design items that grow with the party, unlock milestones, and keep progression meaningful.",
    url: "https://wiki.shattered-codex.com/modules/sc-ascendant-items",
    image: "modules/sc-simple-sockets/assets/support/carousel/ascendant-items.webp",
    tone: "violet"
  },
  {
    id: "more-gems",
    name: "SC - More Gems",
    status: "Patreon",
    eyebrow: "120+ GEMS • MONTHLY DROPS",
    description: "Expand Simple Sockets with a large ready-to-play gem library and fresh monthly content.",
    url: "https://wiki.shattered-codex.com/modules/sc-more-gems",
    image: "modules/sc-simple-sockets/assets/support/carousel/more-gems.webp",
    tone: "azure"
  },
  {
    id: "runesmith",
    name: "SC - Runesmith",
    status: "Patreon",
    eyebrow: "RUNE CRAFTING • CUSTOM SYSTEMS",
    description: "Forge your own rune ecosystem with focused tooling for creation, balance, and progression.",
    url: "https://wiki.shattered-codex.com/modules/sc-runesmith",
    image: "modules/sc-simple-sockets/assets/support/carousel/runesmith.webp",
    tone: "teal"
  },
  {
    id: "npc-character-colors",
    name: "SC - NPC & Character Colors",
    status: "Free",
    eyebrow: "VISUAL CLARITY • SHEET IDENTITY",
    description: "Give actor sheets stronger identity with configurable rarity, NPC, and character color themes.",
    url: "https://wiki.shattered-codex.com/modules/sc-npc-and-character-colors",
    image: "modules/sc-simple-sockets/assets/support/carousel/npc-character-colors.webp",
    tone: "rose"
  },
  {
    id: "the-cauldron",
    name: "SC - The Cauldron",
    status: "New",
    eyebrow: "CRAFTING • ALCHEMY",
    description: "Run recipe-driven crafting with ingredients, outcomes, and player-facing discovery loops.",
    url: "https://wiki.shattered-codex.com/modules/sc-the-cauldron",
    image: "modules/sc-simple-sockets/assets/support/carousel/the-cauldron.webp",
    tone: "green"
  }
];

const RELEASE_SECTIONS = [
  {
    id: "added",
    title: "Added",
    tone: "added",
    items: [
      {
        title: "Extract Gem",
        text: "Added a per-slot configuration that allows a gem to be extracted regardless of whether the global Delete Gem On Removal setting is enabled, giving finer control over socket behavior."
      },
      {
        title: "Extract Gem Macro",
        text: "Added a macro that lets you extract a gem from the selected slot regardless of whether destroy-on-removal is enabled, which works well for item interactions, vendors, or roleplay-driven gem recovery."
      },
      {
        title: "Remove and Extract Icons",
        html: "<strong>Remove and Extract Icons</strong>: Updated the gem actions with distinct icons so each behavior is easier to identify at a glance: <i class=\"fas fa-burst scsockets-support-popup__inline-icon\" aria-hidden=\"true\"></i> remove gem and <i class=\"fas fa-hammer-crash scsockets-support-popup__inline-icon\" aria-hidden=\"true\"></i> extract gem."
      },
      {
        title: "+Details Damage Types",
        text: "Reworked the +Details extra damage system so you can select multiple damage types or use the host item's damage type. During the roll, this lets you choose which extra damage type that gem applies."
      },
      {
        text: "Added four damage roll layout options in module settings to make the extra damage granted by gems clearer during rolls."
      },
      {
        text: "Added a debug setting to make troubleshooting easier."
      },
      {
        text: "Added automated tests to support module development and make the system more cohesive and robust."
      }
    ]
  },
  {
    id: "fixed",
    title: "Fixed",
    tone: "fixed",
    items: [
      {
        text: "Improved Tidy sheet integration with better layout behavior and badges for activities and active effects."
      },
      {
        text: "Improved the rendering flow for better performance and more stable refresh behavior."
      },
      {
        text: "Resolved several smaller bugs across the module."
      }
    ]
  }
];

function localizeStatus(status) {
  return Constants.localize(`SCSockets.SupportCard.Status.${status}`, status);
}

export function buildSupportCardContent(moduleVersion) {
  const totalEntries = String(CATALOG_ENTRIES.length).padStart(2, "0");

  return {
    strings: {
      title: Constants.localize("SCSockets.SupportCard.Title", "What's New"),
      moreFrom: Constants.localize("SCSockets.SupportCard.MoreFrom", "More from Shattered Codex"),
      releaseSubtitle: Constants.localize(
        "SCSockets.SupportCard.ReleaseSubtitle",
        "SC - Simple Sockets Changelog"
      ),
      viewModule: Constants.localize("SCSockets.SupportCard.ViewModule", "View on wiki"),
      dontShowAgain: Constants.localize(
        "SCSockets.SupportCard.DontShowAgain",
        "Don't show again until the next update"
      ),
      featureRequest: Constants.localize("SCSockets.SupportCard.FeatureRequest", "Feature Request"),
      close: Constants.localize("SCSockets.SupportCard.Close", "Close"),
      versionBadge: `v${moduleVersion}`
    },
    catalog: CATALOG_ENTRIES.map((entry, index) => ({
      ...entry,
      index,
      totalLabel: totalEntries,
      indexLabel: String(index + 1).padStart(2, "0"),
      statusLabel: localizeStatus(entry.status)
    })),
    releaseSections: RELEASE_SECTIONS.map((section) => ({
      ...section,
      count: section.items.length
    })),
    links: {
      wiki: {
        label: Constants.localize("SCSockets.SupportCard.Wiki", "Wiki"),
        url: Constants.MODULE_WIKI_URL
      },
      discord: {
        label: Constants.localize("SCSockets.SupportCard.Discord", "Discord"),
        url: DISCORD_URL
      },
      patreon: {
        label: Constants.localize("SCSockets.SupportCard.Link", "Patreon"),
        url: PATREON_URL
      },
      featureRequest: {
        label: Constants.localize("SCSockets.SupportCard.FeatureRequest", "Feature Request"),
        url: FEATURE_REQUEST_URL
      }
    }
  };
}
