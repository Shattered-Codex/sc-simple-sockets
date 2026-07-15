import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";
import { canUserSeeSlot, getSlotConfig } from "./socketSlotConfig.js";

export function buildSocketLayoutContext(item, {
  editable = false,
  canManageSockets = false,
  canAddSocketSlot = false,
  sockets = []
} = {}) {
  const socketTabLayout = ModuleSettings.getSocketTabLayout();
  const useSocketGridLayout = socketTabLayout === ModuleSettings.SOCKET_TAB_LAYOUT_GRID;
  // The host item has no persistent charge of its own: pools are always derived
  // from the gems currently socketed into it.
  const socketPools = GemResourceService.aggregatePools(sockets);
  const socketResourceRows = (Array.isArray(sockets) ? sockets : []).reduce((rows, slot, index) => {
    const resource = GemResourceService.getSlotResource(slot);
    if (resource && canUserSeeSlot({ ...slot, slotConfig: getSlotConfig(slot) })) {
      rows.push({
        slotNumber: index + 1,
        gemName: String(slot?.gem?.name ?? slot?.name ?? "").trim(),
        gemImg: slot?.gem?.img ?? "",
        resourceKey: resource.key,
        value: resource.value,
        max: resource.max,
        chargesLabel: `${resource.value}/${resource.max}`,
        destroyOnEmpty: resource.destroyOnEmpty === true,
        destroyAtZeroLabel: Constants.localize(
          resource.destroyOnEmpty === true
            ? "SCSockets.SocketPools.DestroyYes"
            : "SCSockets.SocketPools.DestroyNo",
          resource.destroyOnEmpty === true ? "Yes" : "No"
        )
      });
    }
    return rows;
  }, []);

  return {
    socketPools,
    hasSocketPools: socketPools.length > 0,
    socketResourceRows,
    hasSocketResourceRows: socketResourceRows.length > 0,
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
        const tintColor = slotConfig.color;
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
        const slotName = String(slot?.name ?? "").trim()
          || Constants.localize("SCSockets.SocketEmptyName", "Empty");
        const gemName = String(slot?.gem?.name ?? "").trim();
        const slotSummary = gemName && gemName !== slotName ? gemName : "";
        const slotAriaLabel = slotSummary ? `${slotName}: ${slotSummary}` : slotName;

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
          gemName,
          gemUuid: "",
          slotName,
          slotSummary,
          slotAriaLabel,
          hostItemUuid: item?.uuid ?? ""
        });
        return entries;
      }, [])
      : []
  };
}
