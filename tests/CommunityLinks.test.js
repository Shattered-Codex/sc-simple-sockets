import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { CommunityLinks } from "../scripts/core/settings/CommunityLinks.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("CommunityLinks", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
    delete globalThis.window;
  });

  test("the strip renders wiki, Patreon, and Discord, in that order", () => {
    assert.deepEqual(CommunityLinks.links().map((link) => link.id), ["wiki", "patreon", "discord"]);
  });

  test("outbound links point at the module's declared URLs over https", () => {
    const urls = Object.fromEntries(CommunityLinks.links().map((link) => [link.id, link.url]));

    assert.equal(urls.wiki, Constants.MODULE_WIKI_URL);
    assert.equal(urls.discord, Constants.DISCORD_URL);
    for (const id of ["wiki", "discord"]) {
      assert.match(urls[id], /^https:\/\//, `${id} is not an https URL`);
    }
    assert.match(Constants.PATREON_URL, /^https:\/\/www\.patreon\.com\//);
  });

  test("every link carries an icon and a resolvable label", () => {
    for (const link of CommunityLinks.links()) {
      assert.match(link.icon, /^fa[sb] fa-/, `${link.id} has no Font Awesome icon`);
      assert.ok(link.label.length > 0, `${link.id} has no label`);
      assert.ok(link.tooltip.length > 0, `${link.id} has no tooltip`);
    }
  });

  test("opening an outbound link returns its URL and hands it to the browser once", () => {
    const opened = [];
    globalThis.window = { open: (...args) => opened.push(args) };

    assert.equal(CommunityLinks.open("discord"), Constants.DISCORD_URL);
    assert.equal(opened.length, 1);
    assert.deepEqual(opened[0], [Constants.DISCORD_URL, "_blank", "noopener"]);
  });

  test("the Patreon entry opens the support popup instead of a browser tab", async () => {
    const opened = [];
    globalThis.window = { open: (...args) => opened.push(args) };
    // The popup application needs the Foundry client classes, which this
    // environment does not provide: the handler warns instead of rejecting.
    const warn = console.warn;
    console.warn = () => {};

    assert.equal(CommunityLinks.open("patreon"), null);
    assert.equal(opened.length, 0);
    assert.equal(CommunityLinks.links().find((link) => link.id === "patreon").url, "");

    await new Promise((resolve) => setImmediate(resolve));
    console.warn = warn;
  });

  test("an unknown link id opens nothing instead of throwing", () => {
    const opened = [];
    globalThis.window = { open: (...args) => opened.push(args) };

    assert.equal(CommunityLinks.open("myspace"), null);
    assert.equal(opened.length, 0);
  });

  test("injecting without a settings root is a no-op", () => {
    assert.equal(CommunityLinks.inject(null), null);
    assert.equal(CommunityLinks.inject(undefined), null);
    assert.equal(CommunityLinks.inject({}), null);
  });
});
