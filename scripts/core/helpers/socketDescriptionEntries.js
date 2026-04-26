import { Constants } from "../Constants.js";
import { ItemResolver } from "../ItemResolver.js";
import { canUserSeeSlot, getSlotConfig } from "./socketSlotConfig.js";

export async function buildSocketDescriptionEntries(item, slots) {
  const textEditor = Constants.getTextEditor();
  const enrichmentOptions = {
    secrets: item?.isOwner ?? false,
    relativeTo: item,
    rollData: item?.getRollData?.()
  };

  const entries = [];
  for (const slot of slots) {
    const slotConfig = getSlotConfig(slot);
    if (!canUserSeeSlot({ ...slot, slotConfig })) {
      continue;
    }

    const gemDescription = slot?.gem
      ? (ItemResolver.getSnapshotMeta(slot?._gemData)?.socketDescription ?? "")
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
