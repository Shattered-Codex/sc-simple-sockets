import { Constants } from "../Constants.js";

const PATREON_URL = Constants.PATREON_URL;
const DISCORD_URL = Constants.DISCORD_URL;
const FEATURE_REQUEST_URL = "https://github.com/Shattered-Codex/sc-simple-sockets/issues";

const PUZZLE_ENGINE_URL = "https://wiki.shattered-codex.com/modules/sc-puzzle-engine";
const PUZZLE_ENGINE_NAME = "SC - Puzzle Engine";
const carouselImage = (name) => `modules/${Constants.MODULE_ID}/assets/support/carousel/${name}.webp`;

/**
 * The showcase is dedicated to SC - Puzzle Engine: one module, one slide per
 * capability, using the screenshots published on its wiki page.
 */
const CATALOG_ENTRIES = [
  {
    id: "puzzle-engine-dexterity",
    module: PUZZLE_ENGINE_NAME,
    name: "Challenges the table plays",
    status: "EarlyAccess",
    eyebrow: "SC - PUZZLE ENGINE • SKILL & RHYTHM",
    description: "Lockpicking stress bars, Timing Bar hit streaks, Simon crystal sequences, and Arrow Lane runs turn what used to be a flat ability check into something the players actually perform at the table.",
    url: PUZZLE_ENGINE_URL,
    image: carouselImage("puzzle-engine-lockpicking-solver"),
    tone: "ember"
  },
  {
    id: "puzzle-engine-documents",
    module: PUZZLE_ENGINE_NAME,
    name: "Puzzles as real documents",
    status: "EarlyAccess",
    eyebrow: "SC - PUZZLE ENGINE • JOURNAL PAGES",
    description: "Every puzzle is a Puzzle journal page with its own sheet: rules, attempts, presentation, and solution all live inside the journal, so an encounter travels with the adventure instead of living in your notes.",
    url: PUZZLE_ENGINE_URL,
    image: carouselImage("puzzle-engine-puzzle-codex-journal"),
    tone: "violet"
  },
  {
    id: "puzzle-engine-types",
    module: PUZZLE_ENGINE_NAME,
    name: "Twenty challenge types",
    status: "EarlyAccess",
    eyebrow: "SC - PUZZLE ENGINE • CHALLENGE CATALOG",
    description: "PIN, Password, Mastermind, Ordering, Lights Out, Simon, Cryptex, Memory, Lockpicking, Timing Bar, Cipher, Word Search, Wordle, Placement, Drawing, Discs, Mosaic, Arrow Lane, Direct Effect, and Check — each with its own configuration and, where it applies, its own player interface.",
    url: PUZZLE_ENGINE_URL,
    image: carouselImage("puzzle-engine-puzzle-type-picker"),
    tone: "azure"
  },
  {
    id: "puzzle-engine-consequences",
    module: PUZZLE_ENGINE_NAME,
    name: "Attempts, items, consequences",
    status: "EarlyAccess",
    eyebrow: "SC - PUZZLE ENGINE • GM CONFIGURATION",
    description: "Limit attempts, require an item to even try, and configure what success and failure actually do. A live player preview sits next to the form, so you see exactly what the table will see while you build it.",
    url: PUZZLE_ENGINE_URL,
    image: carouselImage("puzzle-engine-configuration-tab"),
    tone: "gold"
  },
  {
    id: "puzzle-engine-solvers",
    module: PUZZLE_ENGINE_NAME,
    name: "Solver windows for players",
    status: "EarlyAccess",
    eyebrow: "SC - PUZZLE ENGINE • MULTIPLAYER SESSIONS",
    description: "Players get a synchronized window with seating, turns, timers, and spectators. Answers are never sent to the client: the active GM validates every attempt and owns the consequences.",
    url: PUZZLE_ENGINE_URL,
    image: carouselImage("puzzle-engine-mastermind-solver"),
    tone: "teal"
  },
  {
    id: "puzzle-engine-presentation",
    module: PUZZLE_ENGINE_NAME,
    name: "Themes for every scene",
    status: "EarlyAccess",
    eyebrow: "SC - PUZZLE ENGINE • PRESENTATION",
    description: "A theme gallery restyles the solver window per puzzle, with bundled runic and celtic typefaces, so a dwarven vault, an arcane seal, and a clockwork lock never look like the same dialog.",
    url: PUZZLE_ENGINE_URL,
    image: carouselImage("puzzle-engine-presentation-tab"),
    tone: "rose"
  },
  {
    id: "puzzle-engine-hub",
    module: PUZZLE_ENGINE_NAME,
    name: "The Puzzle Hub",
    status: "EarlyAccess",
    eyebrow: "SC - PUZZLE ENGINE • SESSION CONTROL",
    description: "One window lists every puzzle in the world with its current state — draft, open, solved — so you can open, close, reset, unlock, or force-solve any of them mid-session without digging through journals.",
    url: PUZZLE_ENGINE_URL,
    image: carouselImage("puzzle-engine-puzzle-hub"),
    tone: "green"
  },
  {
    id: "puzzle-engine-triggers",
    module: PUZZLE_ENGINE_NAME,
    name: "Triggers, state and chaining",
    status: "EarlyAccess",
    eyebrow: "SC - PUZZLE ENGINE • CANVAS INTEGRATION",
    description: "Bind a puzzle to doors, walls, lights, tiles, tokens, regions, drawings, map notes, ambient sounds, macros, or enriched links. State can be per player or world-wide, and a solved puzzle can chain straight into the next step of the encounter.",
    url: PUZZLE_ENGINE_URL,
    image: carouselImage("puzzle-engine-state-tab"),
    tone: "azure"
  }
];

const RELEASE_SECTIONS = [
  {
    id: "added",
    title: "Added",
    tone: "added",
    items: [
      {
        title: "Custom empty socket artwork",
        text: "Each socket slot can carry its own image for the empty state, so one item can mix a battery bay, a rune notch, and a plain socket instead of only tinting the same frame. Set it in Socket Slot Settings — through the field or by clicking the slot preview — and press Default to restore the original artwork."
      },
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
        title: "Every option in one window",
        text: "The What's New popup toggle and debug trace logging moved into a new Advanced tab of the Module configuration window, so nothing is left loose in Foundry's module list. The wiki, Patreon, and Discord links now sit in a single compact row."
      },
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
