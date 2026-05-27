import { Constants } from "../Constants.js";
import { AddSocketWorkflow, DEFAULT_OPTIONS } from "./AddSocketWorkflow.js";
import { ExtractGemWorkflow } from "./ExtractGemWorkflow.js";
import { SelectionController } from "./SelectionController.js";
import { SocketAPI } from "./SocketAPI.js";
import { SocketService } from "../services/SocketService.js";

export class MacroAPI {
  static register() {
    Hooks.once("ready", () => {
      const module = game.modules.get(Constants.MODULE_ID);
      if (!module) return;

      module.api ??= {};
      module.api.macro ??= {};

      module.api.macro.addSocketInteractive = async (options = {}) => {
        const workflow = new AddSocketWorkflow(options);
        return workflow.run();
      };
      module.api.macro.extractGemInteractive = async (options = {}) => {
        const workflow = new ExtractGemWorkflow(options);
        return workflow.run();
      };

      module.api.macro.selectItemForSocket = async (options = {}) => SelectionController.selectItem({
        ...DEFAULT_OPTIONS,
        ...options
      });
      module.api.macro.removeGemWithoutDeleting = async (itemOrUuid, slotIndex, options = {}) =>
        SocketAPI.removeGem(itemOrUuid, slotIndex, {
          ...options,
          mode: SocketService.REMOVE_GEM_MODE_KEEP
        });
    });
  }
}
