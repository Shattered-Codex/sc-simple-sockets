import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");

test("socket roll data activates synchronously during init before document preparation", () => {
  const initStart = source.indexOf('Hooks.once("init"');
  const setupStart = source.indexOf('Hooks.once("setup"');
  const firstAwait = source.indexOf("\n  await ", initStart);
  const activation = source.indexOf("SocketRollDataService.activate();", initStart);

  assert.ok(initStart >= 0, "init hook should exist");
  assert.ok(activation > initStart, "socket roll data should activate inside init");
  assert.ok(activation < firstAwait, "activation must happen before init's first await");
  assert.ok(activation < setupStart, "activation must not wait until setup");
});
