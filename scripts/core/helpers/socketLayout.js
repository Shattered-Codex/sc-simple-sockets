import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";

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
    canAddSocketSlot,
    dataEditable: editable ? "true" : "false",
    socketTabLayout,
    socketTabVariant: useSocketGridLayout ? "cauldron" : "default",
    socketTabLayoutClass: `is-layout-${socketTabLayout}`,
    useSocketGridLayout,
    useSocketListLayout: !useSocketGridLayout,
    sockets: Array.isArray(sockets)
      ? sockets.map((slot, index) => ({
        ...slot,
        hasGem: Boolean(slot?.gem),
        index,
        displayIndex: index + 1,
        slotFrameImg: Constants.SOCKET_SLOT_IMG,
        gemImg: slot?.gem?.img ?? "",
        gemName: slot?.gem?.name ?? "",
        gemUuid: slot?.gem?.uuid ?? slot?.gem?.sourceUuid ?? slot?._gemData?.flags?.core?.sourceId ?? "",
        hostItemUuid: item?.uuid ?? ""
      }))
      : []
  };
}
