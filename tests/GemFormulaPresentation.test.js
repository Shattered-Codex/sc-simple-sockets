import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { GemFormulaPresentation } from "../scripts/domain/gems/GemFormulaPresentation.js";
import { ModuleSettings } from "../scripts/core/settings/ModuleSettings.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestItem } from "./support/testDocuments.js";

function createGem({ name = "Ruby", img = "icons/ruby.webp", damage = [] } = {}) {
  return createTestItem({
    name,
    img,
    type: "loot",
    flags: {
      [Constants.MODULE_ID]: {
        [Constants.FLAG_GEM_DAMAGE]: damage
      }
    }
  });
}

function createHost({ type = "weapon", gems = [], activities } = {}) {
  const system = {};
  if (activities !== undefined) {
    system.activities = activities;
  }
  return createTestItem({
    type,
    system,
    flags: {
      [Constants.MODULE_ID]: {
        [Constants.FLAGS.sockets]: gems.map((gem, index) => ({
          _slot: index,
          name: gem.name,
          img: gem.img,
          _gemData: gem.toObject()
        }))
      }
    }
  });
}

describe("GemFormulaPresentation", () => {
  beforeEach(() => {
    installFoundryStubs({
      translations: {
        "Fire": "Fire",
        "Cold": "Cold"
      }
    });

    CONFIG.Dice = {
      DamageRoll: {
        denominations: ["d4", "d6", "d8", "d10"]
      }
    };
    CONFIG.DND5E = {
      damageTypes: {
        cold: "Cold",
        fire: { label: "Fire", icon: "systems/dnd5e/icons/svg/damage/fire.svg" }
      }
    };

    globalThis.Roll = {
      validate(formula) {
        return Boolean(formula) && formula !== "bad formula";
      }
    };
  });

  afterEach(() => {
    delete globalThis.Roll;
    clearFoundryStubs();
  });

  test("returns no entries for an item without gems", () => {
    const host = createHost({ gems: [] });
    assert.deepEqual(GemFormulaPresentation.collectEntries(host), []);
    assert.equal(GemFormulaPresentation.hasEntries(host), false);
  });

  test("returns no entries for unsupported item types", () => {
    const gem = createGem({
      damage: [{ number: 1, die: "d6", types: ["fire"] }]
    });
    const host = createHost({ type: "equipment", gems: [gem] });
    assert.deepEqual(GemFormulaPresentation.collectEntries(host), []);
  });

  test("builds a presentation entry for one gem with fixed type", () => {
    const gem = createGem({
      name: "Ruby",
      img: "icons/ruby.webp",
      damage: [{ number: 1, die: "d6", types: ["fire"] }]
    });
    const host = createHost({ gems: [gem] });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].gemName, "Ruby");
    assert.equal(entries[0].gemImg, "icons/ruby.webp");
    assert.equal(entries[0].formula, "1d6");
    assert.equal(entries[0].typeMode, "fixed");
    assert.equal(entries[0].typeLabel, "Fire");
  });

  test("collects multiple damage lines across multiple gems", () => {
    const ruby = createGem({
      name: "Ruby",
      damage: [
        { number: 1, die: "d6", types: ["fire"] },
        { number: 0, die: "", bonus: 2, types: ["fire"] }
      ]
    });
    const sapphire = createGem({
      name: "Sapphire",
      img: "icons/sapphire.webp",
      damage: [{ number: 1, die: "d4", types: ["cold"] }]
    });
    const host = createHost({ gems: [ruby, sapphire] });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.equal(entries.length, 3);
    assert.deepEqual(entries.map((entry) => entry.formula), ["1d6", "2", "1d4"]);
    assert.deepEqual(entries.map((entry) => entry.gemName), ["Ruby", "Ruby", "Sapphire"]);
  });

  test("labels inherit entries as Same as host", () => {
    const gem = createGem({
      damage: [{ number: 1, die: "d8", types: [Constants.GEM_DAMAGE_INHERIT_TYPE] }]
    });
    const host = createHost({ gems: [gem] });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].typeMode, "inherit");
    assert.equal(entries[0].typeLabel, "Same as host");
  });

  test("uses custom formulas verbatim", () => {
    const gem = createGem({
      damage: [{
        custom: { enabled: true, formula: "1d@scale.monk.martial-arts.faces" },
        types: ["fire"]
      }]
    });
    const host = createHost({ gems: [gem] });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].formula, "1d@scale.monk.martial-arts.faces");
  });

  test("weapons include attack-only entries and exclude spell-only entries", () => {
    const gem = createGem({
      damage: [
        { number: 1, die: "d6", types: ["fire"], activity: "attack" },
        { number: 1, die: "d4", types: ["cold"], activity: "spell" }
      ]
    });
    const host = createHost({ type: "weapon", gems: [gem] });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].formula, "1d6");
  });

  test("spells include spell-only entries", () => {
    const gem = createGem({
      damage: [{ number: 2, die: "d8", types: ["fire"], activity: "spell" }]
    });
    const host = createHost({ type: "spell", gems: [gem], activities: { a1: { type: "save" } } });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].formula, "2d8");
  });

  test("spells without attack activities exclude attack-only entries", () => {
    const gem = createGem({
      damage: [{ number: 1, die: "d6", types: ["fire"], activity: "attack" }]
    });
    const host = createHost({ type: "spell", gems: [gem], activities: { a1: { type: "save" } } });

    assert.deepEqual(GemFormulaPresentation.collectEntries(host), []);
  });

  test("spells with attack activities include attack-only entries", () => {
    const gem = createGem({
      damage: [{ number: 1, die: "d6", types: ["fire"], activity: "attack" }]
    });
    const host = createHost({ type: "spell", gems: [gem], activities: { a1: { type: "attack" } } });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.equal(entries.length, 1);
  });

  test("resolves attack activity type for weapons without activity data", () => {
    const host = createHost({ type: "weapon", gems: [] });
    assert.equal(GemFormulaPresentation.resolveActivityType(host), "attack");
  });

  test("builds tooltip content with image, name, formula and type", () => {
    const gem = createGem({
      name: "Ruby <script>",
      damage: [{ number: 1, die: "d6", types: ["fire"] }]
    });
    const host = createHost({ gems: [gem] });
    const entries = GemFormulaPresentation.collectEntries(host);

    const html = GemFormulaPresentation.buildTooltipContent(entries, { showImage: true });
    assert.match(html, /sc-sockets-gem-formula-tooltip-content/);
    assert.match(html, /sc-sockets-gem-formula-tooltip-img/);
    assert.match(html, /Ruby &lt;script&gt;/);
    assert.match(html, /1d6/);
    assert.match(html, /Fire/);
    assert.doesNotMatch(html, /<script>/);

    // The gem image is always present; disabling the image setting only
    // omits the gem name from the breakdown rows.
    const withoutName = GemFormulaPresentation.buildTooltipContent(entries, { showImage: false });
    assert.match(withoutName, /sc-sockets-gem-formula-tooltip-img/);
    assert.doesNotMatch(withoutName, /sc-sockets-gem-formula-tooltip-name/);
  });

  test("exposes damage type icon metadata for fixed types", () => {
    const gem = createGem({
      damage: [
        { number: 1, die: "d6", types: ["fire"] },
        { number: 1, die: "d4", types: ["cold"] }
      ]
    });
    const host = createHost({ gems: [gem] });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.deepEqual(entries[0].typeDetails, [{
      value: "fire",
      label: "Fire",
      icon: "systems/dnd5e/icons/svg/damage/fire.svg"
    }]);
    assert.deepEqual(entries[1].typeDetails, [{ value: "cold", label: "Cold", icon: null }]);
  });

  test("inherit entries expose no type icon metadata", () => {
    const gem = createGem({
      damage: [{ number: 1, die: "d8", types: [Constants.GEM_DAMAGE_INHERIT_TYPE] }]
    });
    const host = createHost({ gems: [gem] });

    const entries = GemFormulaPresentation.collectEntries(host);
    assert.deepEqual(entries[0].typeDetails, []);
  });

  test("tooltip renders damage type icons with text fallback", () => {
    const gem = createGem({
      damage: [
        { number: 1, die: "d6", types: ["fire"] },
        { number: 1, die: "d4", types: ["cold"] }
      ]
    });
    const host = createHost({ gems: [gem] });
    const entries = GemFormulaPresentation.collectEntries(host);

    const html = GemFormulaPresentation.buildTooltipContent(entries);
    assert.match(html, /<dnd5e-icon src="systems\/dnd5e\/icons\/svg\/damage\/fire.svg">/);
    // Cold has no icon metadata, so it falls back to text.
    assert.match(html, /Cold/);
  });

  test("sums gem attack bonuses and keeps per-gem parts", () => {
    const ruby = createTestItem({
      name: "Ruby",
      img: "icons/ruby.webp",
      type: "loot",
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_ATTACK_BONUS]: 2
        }
      }
    });
    const sapphire = createTestItem({
      name: "Sapphire",
      type: "loot",
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_ATTACK_BONUS]: "1.9"
        }
      }
    });
    const inert = createGem({ name: "Quartz" });
    const host = createHost({ gems: [ruby, sapphire, inert] });

    const result = GemFormulaPresentation.collectAttackBonus(host);
    assert.equal(result.total, 3);
    assert.deepEqual(
      result.parts.map((part) => [part.gemName, part.bonus]),
      [["Ruby", 2], ["Sapphire", 1]]
    );
  });

  test("attack bonus is empty for unsupported items and gems without the flag", () => {
    const gem = createGem({ name: "Quartz" });
    const host = createHost({ type: "equipment", gems: [gem] });
    assert.deepEqual(GemFormulaPresentation.collectAttackBonus(host), { total: 0, parts: [] });

    const weapon = createHost({ gems: [gem] });
    assert.deepEqual(GemFormulaPresentation.collectAttackBonus(weapon), { total: 0, parts: [] });
  });

  test("builds the attack bonus tooltip with image, name and signed value", () => {
    const parts = [{ gemName: "Ruby & Co", gemImg: "icons/ruby.webp", bonus: 2 }];
    const html = GemFormulaPresentation.buildAttackBonusTooltip(parts);
    assert.match(html, /Ruby &amp; Co/);
    assert.match(html, /\+2/);
    assert.match(html, /sc-sockets-gem-formula-tooltip-img/);
    assert.equal(GemFormulaPresentation.buildAttackBonusTooltip([]), "");
  });

  test("formats signed bonuses", () => {
    assert.equal(GemFormulaPresentation.formatSignedBonus(2), "+2");
    assert.equal(GemFormulaPresentation.formatSignedBonus(-1), "-1");
    assert.equal(GemFormulaPresentation.formatSignedBonus(0), "+0");
  });

  test("builds a plain summary for accessibility", () => {
    const gem = createGem({
      name: "Ruby",
      damage: [{ number: 1, die: "d6", types: ["fire"] }]
    });
    const host = createHost({ gems: [gem] });
    const entries = GemFormulaPresentation.collectEntries(host);

    assert.equal(GemFormulaPresentation.buildPlainSummary(entries), "[Ruby] 1d6 Fire");
  });
});

describe("Gem formula layout settings", () => {
  afterEach(() => {
    clearFoundryStubs();
  });

  test("defaults to current mode when the setting is missing or invalid", () => {
    installFoundryStubs();
    assert.equal(ModuleSettings.getGemFormulaLayoutMode(), ModuleSettings.GEM_FORMULA_LAYOUT_CURRENT);

    clearFoundryStubs();
    installFoundryStubs({
      settings: {
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_GEM_FORMULA_LAYOUT}`]: "bogus"
      }
    });
    assert.equal(ModuleSettings.getGemFormulaLayoutMode(), ModuleSettings.GEM_FORMULA_LAYOUT_CURRENT);
  });

  test("returns the stored layout mode", () => {
    installFoundryStubs({
      settings: {
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_GEM_FORMULA_LAYOUT}`]: "Inline"
      }
    });
    assert.equal(ModuleSettings.getGemFormulaLayoutMode(), ModuleSettings.GEM_FORMULA_LAYOUT_INLINE);
  });

  test("show image defaults to true and honors the stored value", () => {
    installFoundryStubs();
    assert.equal(ModuleSettings.shouldShowGemFormulaImages(), true);

    clearFoundryStubs();
    installFoundryStubs({
      settings: {
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_GEM_FORMULA_SHOW_IMAGE}`]: false
      }
    });
    assert.equal(ModuleSettings.shouldShowGemFormulaImages(), false);
  });
});
