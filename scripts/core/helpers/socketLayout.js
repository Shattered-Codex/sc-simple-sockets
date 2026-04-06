import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { getSlotConfig } from "./socketSlotConfig.js";

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
    canAddSocketSlot,
    dataEditable: editable ? "true" : "false",
    socketTabLayout,
    socketTabVariant: useSocketGridLayout ? "cauldron" : "default",
    socketTabLayoutClass: `is-layout-${socketTabLayout}`,
    useSocketGridLayout,
    useSocketListLayout: !useSocketGridLayout,
    sockets: Array.isArray(sockets)
      ? sockets.map((slot, index) => {
        const slotConfig = getSlotConfig(slot);
        const hasGem = Boolean(slot?.gem);
        const tintColor = useSocketGridLayout
          ? slotConfig.color
          : (hasGem ? "" : slotConfig.color);
        const slotMaskStyle = tintColor
          ? `--sc-sockets-slot-color:${tintColor};`
          : "";

        return {
          ...slot,
          hasGem,
          hasSlotTint: Boolean(tintColor),
          index,
          displayIndex: index + 1,
          slotFrameImg: Constants.SOCKET_SLOT_IMG,
          slotMaskStyle,
          slotColor: tintColor,
          slotConfig,
          gemImg: slot?.gem?.img ?? "",
          gemName: slot?.gem?.name ?? "",
          gemUuid: "",
          hostItemUuid: item?.uuid ?? ""
        };
      })
      : []
  };
}
