import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { canUserSeeSlot, getSlotConfig } from "./socketSlotConfig.js";

export function buildSocketLayoutContext(item, {
  editable = false,
  canManageSockets = false,
  canAddSocketSlot = false,
  sockets = []
} = {}) {
  const socketTabLayout = ModuleSettings.getSocketTabLayout();
  const useSocketGridLayout = socketTabLayout === ModuleSettings.SOCKET_TAB_LAYOUT_GRID;

  return {
    editable,
    canManageSockets,
    canConfigureSlots: canManageSockets,
    canToggleSlotVisibility: canManageSockets && Boolean(globalThis.game?.user?.isGM),
    canAddSocketSlot,
    dataEditable: editable ? "true" : "false",
    socketTabLayout,
    socketTabVariant: useSocketGridLayout ? "cauldron" : "default",
    socketTabLayoutClass: `is-layout-${socketTabLayout}`,
    useSocketGridLayout,
    useSocketListLayout: !useSocketGridLayout,
    sockets: Array.isArray(sockets)
      ? sockets.reduce((entries, slot, index) => {
        const slotConfig = getSlotConfig(slot);
        if (!canUserSeeSlot({ ...slot, slotConfig })) {
          return entries;
        }

        const hasGem = Boolean(slot?.gem);
        const tintColor = useSocketGridLayout
          ? slotConfig.color
          : (hasGem ? "" : slotConfig.color);
        const slotMaskStyle = tintColor
          ? `--sc-sockets-slot-color:${tintColor};`
          : "";

        const hiddenTooltip = slotConfig.hidden
          ? Constants.localize("SCSockets.Tooltips.ShowSlot", "Show this slot to players.")
          : Constants.localize("SCSockets.Tooltips.HideSlot", "Hide this slot from players.");
        const destroysGemOnRemoval = slotConfig.deleteGemOnRemoval || ModuleSettings.shouldDeleteGemOnRemoval();
        const removeGemTooltip = destroysGemOnRemoval
          ? Constants.localize("SCSockets.Tooltips.DestroyGem", "Destroy gem")
          : Constants.localize("SCSockets.Tooltips.ExtractGem", "Extract gem");
        const removeGemIcon = destroysGemOnRemoval ? "fa-burst" : "fa-hammer-crash";

        entries.push({
          ...slot,
          destroysGemOnRemoval,
          hidden: slotConfig.hidden,
          hasGem,
          hasSlotTint: Boolean(tintColor),
          index,
          displayIndex: index + 1,
          slotFrameImg: Constants.SOCKET_SLOT_IMG,
          slotMaskStyle,
          slotColor: tintColor,
          slotConfig,
          removeGemIcon,
          removeGemTooltip,
          visibilityIcon: slotConfig.hidden ? "fa-eye-slash" : "fa-eye",
          visibilityTooltip: hiddenTooltip,
          visibilityLabel: hiddenTooltip,
          gemImg: slot?.gem?.img ?? "",
          gemName: slot?.gem?.name ?? "",
          gemUuid: "",
          hostItemUuid: item?.uuid ?? ""
        });
        return entries;
      }, [])
      : []
  };
}
