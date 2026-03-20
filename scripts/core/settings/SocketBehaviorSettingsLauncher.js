import { SocketBehaviorSettingsApp } from "./SocketBehaviorSettingsApp.js";

export class SocketBehaviorSettingsLauncher extends foundry.applications.api.ApplicationV2 {
  render(_force = false, options = {}) {
    const app = new SocketBehaviorSettingsApp();
    app.render(true, options);
    return this;
  }
}
