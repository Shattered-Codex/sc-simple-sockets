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
        title: "Socket-powered Item Uses",
        text: "Set an item's Limited Uses maximum to @sc.sockets.gems or @sc.sockets.total to make its native dnd5e uses follow filled gems or total socket slots. Item Uses consumption and the item's own Recovery profiles continue to work normally."
      },
      {
        title: "Socket-count formulas",
        text: "Use total, filled, and empty socket counts in item and activity formulas. Item-scoped paths count the current item, while @sc.sockets.actor.* paths count sockets across the character."
      },
      {
        title: "Scaling Active Effects",
        text: "Active Effect values can now scale from socket counts, including arithmetic such as @sc.sockets.gems * 2 or floor(@sc.sockets.actor.total / 2), on both Foundry v13 and v14."
      },
      {
        title: "Programmatic socket APIs",
        text: "Macros and integrations can create empty sockets with addSlot and insert gems with addGem. Both APIs accept Item documents or UUIDs, return structured results, and preserve the module's permission, compatibility, and slot rules."
      }
    ]
  },
  {
    id: "improved",
    title: "Improved",
    tone: "improved",
    items: [
      {
        title: "Live socket-backed capacity",
        text: "Inserting or extracting a gem immediately refreshes socket-bound Item Uses. Existing remaining uses are preserved when capacity changes, and derived counters stay read-only on item and actor sheets."
      },
      {
        title: "Recovery formulas",
        text: "The item's native Recovery configuration can reference socket counts directly. For example, floor(@sc.sockets.gems / 2) restores half the number of filled sockets."
      },
      {
        title: "Reliable automation results",
        text: "Socket mutation APIs now report the slot they created or filled, provide stable failure reasons, and serialize simultaneous changes on the same host item."
      }
    ]
  },
  {
    id: "fixed",
    title: "Fixed",
    tone: "fixed",
    items: [
      {
        text: "Fixed transferred sc-chain and sc-conditional-chain activities keeping stale source activity IDs after a gem's activities were copied to the host item."
      },
      {
        text: "Fixed socket-count Active Effects using actor totals where the effect needed the sockets from its source item."
      },
      {
        text: "Fixed AC breakdown attribution for socket-scaled effects so the tooltip matches the bonus that was actually applied."
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
