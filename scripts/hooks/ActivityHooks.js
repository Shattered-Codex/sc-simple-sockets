import { Constants } from "../core/Constants.js";
import { GemCriteria } from "../domain/gems/GemCriteria.js";

Hooks.on("dnd5e.useActivity", async (activity, options = {}) => {
  const item = activity?.item;
  if (!item) return;
  if (!GemCriteria.matches(item)) return;

  ui.notifications?.warn?.(
    Constants.localize("SCSockets.Notifications.GemRequiresSocket", "This gem must be socketed before it can be used.")
  );
  options.event?.preventDefault?.();
  options.event?.stopPropagation?.();
  throw new Error("Gem must be socketed before its activities can be used.");
});
