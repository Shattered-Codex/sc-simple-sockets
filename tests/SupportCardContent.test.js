import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { buildSupportCardContent } from "../scripts/core/support/SupportCardContent.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_PREFIX = `modules/${Constants.MODULE_ID}/`;

describe("buildSupportCardContent", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("the showcase promotes SC - Puzzle Engine on every slide", () => {
    const { catalog } = buildSupportCardContent("2.0.19");

    assert.ok(catalog.length >= 8, "the showcase should carry the full Puzzle Engine tour");
    for (const entry of catalog) {
      assert.equal(entry.url, "https://wiki.shattered-codex.com/modules/sc-puzzle-engine");
      assert.equal(entry.module, "SC - Puzzle Engine");
      assert.match(entry.eyebrow, /^SC - PUZZLE ENGINE • /);
      assert.ok(entry.description.length > 120, `${entry.id} needs a detailed description`);
    }
  });

  test("every slide ships the artwork it points at", () => {
    const { catalog } = buildSupportCardContent("2.0.19");

    for (const entry of catalog) {
      assert.ok(entry.image.startsWith(ASSET_PREFIX), `${entry.id} points outside the module`);
      const file = path.join(MODULE_ROOT, entry.image.slice(ASSET_PREFIX.length));
      assert.ok(existsSync(file), `missing carousel image for ${entry.id}: ${entry.image}`);
    }
  });

  test("slides are numbered for the carousel counter and have distinct ids", () => {
    const { catalog } = buildSupportCardContent("2.0.19");
    const total = String(catalog.length).padStart(2, "0");

    assert.equal(new Set(catalog.map((entry) => entry.id)).size, catalog.length);
    assert.deepEqual(
      catalog.map((entry) => `${entry.indexLabel}/${entry.totalLabel}`),
      catalog.map((_entry, index) => `${String(index + 1).padStart(2, "0")}/${total}`)
    );
  });

  test("footer links use the module's shared community URLs", () => {
    const { links } = buildSupportCardContent("2.0.19");

    assert.equal(links.wiki.url, Constants.MODULE_WIKI_URL);
    assert.equal(links.discord.url, Constants.DISCORD_URL);
    assert.equal(links.patreon.url, Constants.PATREON_URL);
  });
});
