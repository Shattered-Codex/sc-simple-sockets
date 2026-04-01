import { Constants } from "../Constants.js";
import { getSlotConfig } from "./socketSlotConfig.js";

export async function buildSocketDescriptionEntries(item, slots) {
  const getProperty = foundry?.utils?.getProperty;
  const textEditor = Constants.getTextEditor();
  const enrichmentOptions = {
    secrets: item?.isOwner ?? false,
    relativeTo: item,
    rollData: item?.getRollData?.()
  };

  const entries = [];
  for (const slot of slots) {
    const slotConfig = getSlotConfig(slot);
    const gemDescription = slot?.gem
      ? (
        typeof getProperty === "function"
          ? getProperty(slot, `_gemData.flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_DESCRIPTION}`)
          : slot?._gemData?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOCKET_DESCRIPTION]
      )
      : "";
    const slotDescription = slotConfig.description;
    const description = slot?.gem ? gemDescription : slotDescription;
    if (!String(description ?? "").trim().length) {
      continue;
    }

    const enriched = await textEditor?.enrichHTML?.(description, enrichmentOptions) ?? "";
    entries.push({
      name: slot?.gem?.name ?? slot?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty"),
      img: slot?.gem?.img ?? Constants.SOCKET_SLOT_IMG,
      description: enriched,
      isEmptySlot: !slot?.gem,
      slotColor: slot?.gem ? "" : (slotConfig.color || "")
    });
  }

  return entries;
}
