import { Constants } from "../Constants.js";
import { AddSocketWorkflow, DEFAULT_OPTIONS } from "./AddSocketWorkflow.js";
import { SelectionController } from "./SelectionController.js";

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

      module.api.macro.selectItemForSocket = async (options = {}) => SelectionController.selectItem({
        ...DEFAULT_OPTIONS,
        ...options
      });
    });
  }
}
