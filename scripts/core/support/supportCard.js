import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { SupportCardApp } from "../ui/SupportCardApp.js";

const SHARED_SUPPORT_CARD_STATE_KEY = "__scShatteredCodexSupportCardState";

function getSharedState() {
  const existing = globalThis[SHARED_SUPPORT_CARD_STATE_KEY];
  if (existing && typeof existing === "object") {
    return existing;
  }

  const state = { app: null, opening: false, openPromise: null };
  globalThis[SHARED_SUPPORT_CARD_STATE_KEY] = state;
  return state;
}

function normalizeVersion(version) {
  const normalized = String(version ?? "").trim();
  return normalized || "unknown";
}

function getStoredSupportCardVersion() {
  return String(
    game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_CARD_VERSION) ?? ""
  ).trim();
}

function getHideSupportCardSetting() {
  return game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_HIDE_SUPPORT_CARD) === true;
}

function getInitialSuppressSupportCardSetting(moduleVersion) {
  return true;
}

function shouldSuppressSupportCard(moduleVersion) {
  return getHideSupportCardSetting() && getStoredSupportCardVersion() === normalizeVersion(moduleVersion);
}

function resolveModuleData() {
  const moduleData = game.modules.get(Constants.MODULE_ID);
  return {
    moduleTitle: moduleData?.title || "SC - Simple Sockets",
    moduleVersion: normalizeVersion(moduleData?.version)
  };
}

export async function openSupportCard({ force = false } = {}) {
  if (!game.user?.isGM) return;
  const { moduleTitle, moduleVersion } = resolveModuleData();
  if (!force && shouldSuppressSupportCard(moduleVersion)) return null;

  const sharedState = getSharedState();
  if (sharedState.app?.rendered) {
    sharedState.app.bringToTop?.();
    return sharedState.app;
  }

  if (sharedState.opening) {
    try {
      await sharedState.openPromise;
    } catch (error) {
      console.error(`${Constants.MODULE_ID} | Failed waiting for support popup`, error);
    }
    return sharedState.app;
  }

  sharedState.opening = true;
  sharedState.openPromise = (async () => {
    const app = new SupportCardApp({
      moduleTitle,
      moduleVersion,
      suppressUntilNextUpdate: getInitialSuppressSupportCardSetting(moduleVersion),
      onClose: (closedApp) => {
        if (sharedState.app === closedApp) {
          sharedState.app = null;
        }
      }
    });
    sharedState.app = app;
    app.render(true);
    return app;
  })();

  try {
    return await sharedState.openPromise;
  } finally {
    sharedState.opening = false;
    sharedState.openPromise = null;
  }
}

export async function maybeShowSupportCard() {
  if (!game.user?.isGM) return null;
  const { moduleVersion } = resolveModuleData();
  if (shouldSuppressSupportCard(moduleVersion)) return null;
  return openSupportCard();
}
