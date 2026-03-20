import { Constants } from "../Constants.js";

const PATREON_URL = "https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=foundry_module&utm_campaign=support_card";
const GITHUB_ISSUES_URL = "https://github.com/Shattered-Codex/sc-simple-sockets/issues";
const MODULE_SUPPORT_CARD_SIGNATURE = "scsockets-chat-card";
const SHARED_SUPPORT_CARD_SIGNATURE = "sc-shattered-codex-support-card";
const SHARED_SUPPORT_CARD_STATE_KEY = "__scShatteredCodexSupportCardState";
const RECENT_MESSAGE_LIMIT = 5;

const PATREON_MODULES = [
  {
    name: "More Gems",
    description: "More than 100 gems ready to use, plus gem-related items, with new content added every month."
  },
  {
    name: "Setforge",
    description: "Create gear sets that grant extra effects as more set pieces are equipped."
  },
  {
    name: "Forged Sets",
    description: "New ready-to-use sets released every month."
  },
  {
    name: "Runesmit",
    description: "Create your own runes with an interface focused on customization and rune building."
  },
  {
    name: "The Cauldron",
    description: "A crafting-focused module."
  }
];

const FREE_MODULES = [
  {
    name: "SC - Item Rarity Colors",
    description: "Automatically color item sheets based on rarity, with optional gradients and glowing outlines."
  },
  {
    name: "SC - Simple Sockets",
    description: "Add sockets to items with Active Effects, Activities, and Status integration."
  }
];

function buildSupportCardHtml({ moduleTitle, moduleVersion }) {
  const description = Constants.localize(
    "SCSockets.SupportCard.Description",
    "Support my work and stay up to date with exclusive modules and development progress."
  );
  const patreonLabel = Constants.localize("SCSockets.SupportCard.Link", "Patreon");
  const issuesLabel = Constants.localize("SCSockets.SupportCard.Issues", "Issues / Requests");
  const patreonModulesTitle = Constants.localize(
    "SCSockets.SupportCard.PatreonModulesTitle",
    "Patreon modules"
  );
  const freeModulesTitle = Constants.localize(
    "SCSockets.SupportCard.FreeModulesTitle",
    "Free modules"
  );

  const moduleList = PATREON_MODULES
    .map((entry) => `<li style="margin: 0; padding: 0.18rem 0;"><strong>${entry.name}</strong>: ${entry.description}</li>`)
    .join("");
  const freeModuleList = FREE_MODULES
    .map((entry) => `<li style="margin: 0; padding: 0.18rem 0;"><strong>${entry.name}</strong>: ${entry.description}</li>`)
    .join("");

  return `
    <section class="${SHARED_SUPPORT_CARD_SIGNATURE} ${MODULE_SUPPORT_CARD_SIGNATURE}" style="margin: 0.25rem 0; padding: 0; border: 1px solid #c89d47; border-radius: 12px; overflow: hidden; background: radial-gradient(circle at 15% -10%, #2f3a4e 0%, #131924 48%, #0d1118 100%); color: #ece6d8; box-shadow: 0 0 0 1px rgba(200, 157, 71, 0.22), 0 10px 24px rgba(0, 0, 0, 0.35);">
      <header style="padding: 0.75rem 0.9rem; border-bottom: 1px solid rgba(200, 157, 71, 0.35); background: #151d2a;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <img src="modules/sc-simple-sockets/assets/imgs/shattered-codex.webp" alt="${moduleTitle}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(200, 157, 71, 0.5);">
          <div>
            <h3 style="margin: 0; color: #f6efdd; font-size: 1rem; line-height: 1.2;">${moduleTitle}</h3>
            <p style="margin: 0.1rem 0 0; color: #d9c79c; font-size: 0.8rem; line-height: 1.2;">Version ${moduleVersion}</p>
          </div>
        </div>
      </header>
      <div style="padding: 0.85rem 0.9rem;">
        <p style="margin: 0 0 0.65rem; color: #e9e2d2; line-height: 1.45;">${description}</p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
          <a href="${PATREON_URL}" target="_blank" rel="noopener" style="display: inline-block; padding: 0.32rem 0.62rem; border-radius: 999px; text-decoration: none; font-weight: 700; color: #fff8f6; background: #cf3040; border: 1px solid rgba(255, 255, 255, 0.18);">&#10084; ${patreonLabel}</a>
          <a href="${GITHUB_ISSUES_URL}" target="_blank" rel="noopener" style="display: inline-block; padding: 0.32rem 0.62rem; border-radius: 999px; text-decoration: none; font-weight: 700; color: #e7f4ff; background: #2d476a; border: 1px solid rgba(255, 255, 255, 0.14);">${issuesLabel}</a>
        </div>
        <section style="padding: 0.6rem 0.65rem; border: 1px solid rgba(200, 157, 71, 0.32); border-radius: 8px; background: rgba(16, 22, 31, 0.66); margin-bottom: 0.55rem;">
          <p style="margin: 0 0 0.35rem; color: #f0dfb1; font-weight: 700; letter-spacing: 0.01em;">${patreonModulesTitle}</p>
          <ul style="margin: 0; padding: 0 0 0 1.1rem; color: #e5ddca; line-height: 1.35;">
            ${moduleList}
          </ul>
        </section>
        <section style="padding: 0.6rem 0.65rem; border: 1px solid rgba(86, 126, 184, 0.42); border-radius: 8px; background: rgba(14, 20, 32, 0.7);">
          <p style="margin: 0 0 0.35rem; color: #b9d3ff; font-weight: 700; letter-spacing: 0.01em;">${freeModulesTitle}</p>
          <ul style="margin: 0; padding: 0 0 0 1.1rem; color: #d6dfef; line-height: 1.35;">
            ${freeModuleList}
          </ul>
        </section>
      </div>
    </section>
  `;
}

function getRecentMessages() {
  return game.messages?.contents?.slice(-RECENT_MESSAGE_LIMIT) ?? [];
}

function hasRecentSupportCard(messages = getRecentMessages()) {
  return messages.some((message) => message?.content?.includes?.(SHARED_SUPPORT_CARD_SIGNATURE));
}

function getSharedState() {
  const existing = globalThis[SHARED_SUPPORT_CARD_STATE_KEY];
  if (existing && typeof existing === "object") {
    return existing;
  }

  const state = { posting: false };
  globalThis[SHARED_SUPPORT_CARD_STATE_KEY] = state;
  return state;
}

export async function maybeShowSupportCard() {
  if (!game.user?.isGM) return;
  if (hasRecentSupportCard()) return;

  const sharedState = getSharedState();
  if (sharedState.posting) return;

  sharedState.posting = true;

  try {
    if (hasRecentSupportCard()) return;

    const moduleData = game.modules.get(Constants.MODULE_ID);
    const moduleTitle = moduleData?.title || "SC - Simple Sockets";
    const moduleVersion = moduleData?.version || "unknown";
    const userId = game.user?._id ?? game.user?.id ?? game.userId;

    await ChatMessage.create({
      user: userId,
      speaker: ChatMessage.getSpeaker(),
      content: buildSupportCardHtml({ moduleTitle, moduleVersion })
    });
  } finally {
    sharedState.posting = false;
  }
}
