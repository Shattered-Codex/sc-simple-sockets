import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketEffectFormulaService } from "../scripts/core/services/SocketEffectFormulaService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

/**
 * Minimal stand-in for the Foundry roll evaluator: deterministic expressions
 * collapse to a number, dice do not.
 */
class FakeRoll {
  constructor(formula) {
    this.formula = formula;
  }

  get isDeterministic() {
    return !/\dd\d/i.test(this.formula);
  }

  evaluateSync() {
    const evaluate = new Function(
      "Math",
      `"use strict"; const {floor, ceil, round, min, max, abs} = Math; return (${this.formula});`
    );
    this.total = Number(evaluate(Math));
    return this;
  }
}

/** Stand-in for `dnd5e.utils.simplifyBonus`. */
function simplifyBonus(bonus, data = {}) {
  if (!bonus) return 0;
  const replaced = String(bonus).replace(/@([\w.]+)/g, (match, path) => {
    const value = foundry.utils.getProperty(data, path);
    return value == null ? match : String(Number(value) || 0);
  });
  if (replaced.includes("@")) return 0;
  return new FakeRoll(replaced).evaluateSync().total || 0;
}

function gemSlot() {
  return { gem: { name: "Gem" } };
}

function makeItem(slots = []) {
  return {
    documentName: "Item",
    actor: null,
    getFlag(moduleId, key) {
      if (moduleId === Constants.MODULE_ID && key === Constants.FLAGS.sockets) return slots;
      return undefined;
    }
  };
}

function makeActor(items = []) {
  const actor = { documentName: "Actor", items };
  for (const item of items) item.actor = actor;
  return actor;
}

/**
 * The activation guard is module state, so each activation case gets its own
 * module instance.
 */
let freshCounter = 0;
async function freshService() {
  const module = await import(`../scripts/core/services/SocketEffectFormulaService.js?case=${freshCounter++}`);
  return module.SocketEffectFormulaService;
}

describe("SocketEffectFormulaService", () => {
  let armor;
  let ring;
  let actor;

  beforeEach(() => {
    installFoundryStubs();
    game.system = { id: "dnd5e" };
    globalThis.foundry.dice = { Roll: FakeRoll };
    armor = makeItem([gemSlot(), gemSlot(), {}]);
    ring = makeItem([gemSlot()]);
    actor = makeActor([armor, ring]);
  });

  afterEach(() => {
    clearFoundryStubs();
    delete globalThis.libWrapper;
    delete globalThis.fromUuidSync;
    delete globalThis.dnd5e;
  });

  test("counts the sockets of the item that grants the effect", () => {
    const effect = { parent: armor };

    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.gems"), "2");
    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.total"), "3");
    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.empty"), "1");
    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.item.gems"), "2");
  });

  test("counts every socket the actor owns for the actor scope", () => {
    const effect = { parent: armor };

    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.actor.gems"), "3");
    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.actor.total"), "4");
    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.actor.empty"), "1");
  });

  test("collapses resolved arithmetic to a literal so v13 and v14 agree", () => {
    const effect = { parent: armor };

    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.gems * 2"), "4");
    assert.equal(
      SocketEffectFormulaService.resolveChangeValue(effect, actor, "floor(@sc.sockets.actor.gems / 2)"),
      "1"
    );
  });

  test("leaves other roll data paths and dice for the system to evaluate", () => {
    const effect = { parent: armor };

    assert.equal(
      SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.gems + @abilities.dex.mod"),
      "2 + @abilities.dex.mod"
    );
    assert.equal(
      SocketEffectFormulaService.resolveChangeValue(effect, actor, "1d4 + @sc.sockets.gems"),
      "1d4 + 2"
    );
  });

  test("returns values without socket paths untouched", () => {
    const effect = { parent: armor };

    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@abilities.dex.mod"), "@abilities.dex.mod");
    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, 3), 3);
    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.gemsX"), "@sc.sockets.gemsX");
  });

  test("never half-substitutes a longer path", () => {
    const effect = { parent: armor };

    // Substituting the prefix would turn a typo into "2.max", a number that
    // looks deliberate. Leaving it alone lets the system report it instead.
    assert.equal(
      SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.gems.max"),
      "@sc.sockets.gems.max"
    );
    assert.equal(
      SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.actor.total.value"),
      "@sc.sockets.actor.total.value"
    );
  });

  test("has no item scope for an effect that lives on the actor", () => {
    const effect = { parent: actor };

    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.gems"), "0");
    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.actor.gems"), "3");
  });

  test("falls back to the origin item for an effect copied onto the actor", () => {
    globalThis.fromUuidSync = (uuid) => (uuid === "Actor.a.Item.armor" ? armor : null);
    const effect = { parent: actor, origin: "Actor.a.Item.armor" };

    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.gems"), "2");
  });

  test("ignores an origin that cannot be resolved to an item", () => {
    globalThis.fromUuidSync = () => {
      throw new Error("not ready");
    };
    const effect = { parent: actor, origin: "Compendium.pack.Item.x" };

    assert.equal(SocketEffectFormulaService.resolveChangeValue(effect, actor, "@sc.sockets.gems"), "0");
  });

  test("uses the item counts as the actor scope for an unowned item", () => {
    const loose = makeItem([gemSlot()]);

    assert.equal(SocketEffectFormulaService.resolveChangeValue({ parent: loose }, loose, "@sc.sockets.actor.gems"), "1");
  });

  test("rewrites the change before the v14 static applyChange sees it", async () => {
    const service = await freshService();
    const applied = [];
    class ActiveEffect {
      static applyChange(model, change, options) {
        applied.push({ model, change, options, self: this });
        return { [change.key]: change.value };
      }
    }
    globalThis.CONFIG.ActiveEffect = { documentClass: ActiveEffect };
    game.release = { generation: 14 };

    service.activate();
    const change = { key: "system.attributes.ac.bonus", value: "@sc.sockets.gems", effect: { parent: armor } };
    const result = ActiveEffect.applyChange(actor, change, { replacementData: {} });

    assert.deepEqual(result, { "system.attributes.ac.bonus": "2" });
    assert.equal(applied[0].change.value, "2");
    assert.equal(applied[0].self, ActiveEffect);
    assert.deepEqual(applied[0].options, { replacementData: {} });
    // The change the system handed us is never mutated.
    assert.equal(change.value, "@sc.sockets.gems");
  });

  test("rewrites the change before the v13 instance apply sees it", async () => {
    const service = await freshService();
    const applied = [];
    class ActiveEffect {
      constructor(parent) {
        this.parent = parent;
      }

      apply(doc, change) {
        applied.push({ doc, change, self: this });
        return { [change.key]: change.value };
      }
    }
    globalThis.CONFIG.ActiveEffect = { documentClass: ActiveEffect };
    game.release = { generation: 13 };

    service.activate();
    const effect = new ActiveEffect(armor);
    const change = { key: "system.attributes.ac.bonus", value: "@sc.sockets.gems + 1" };
    const result = effect.apply(actor, change);

    assert.deepEqual(result, { "system.attributes.ac.bonus": "3" });
    assert.equal(applied[0].self, effect);
    assert.equal(change.value, "@sc.sockets.gems + 1");
  });

  describe("attribution tooltips", () => {
    const AC = "system.attributes.ac.bonus";
    let effects;
    let rollActor;

    function makeEffect(parent, changes, extra = {}) {
      const effect = { name: "Socket Bonus", parent, changes, ...extra };
      effects.push(effect);
      return effect;
    }

    beforeEach(() => {
      globalThis.CONST.ACTIVE_EFFECT_MODES = { ADD: 2 };
      globalThis.CONFIG.ActiveEffect = { documentClass: { SHIM_FIELDS: {} } };
      globalThis.dnd5e = { utils: { simplifyBonus } };
      effects = [];
      // What dnd5e sees: the actor totals (armor 2 gems + 1 empty, ring 1 gem),
      // with no item scope available.
      rollActor = {
        documentName: "Actor",
        uuid: "Actor.test",
        items: actor.items,
        allApplicableEffects: () => effects,
        getRollData: () => ({ sc: { sockets: { total: 4, gems: 3, empty: 1, actor: { total: 4, gems: 3, empty: 1 } } } })
      };
    });

    test("replaces the actor total dnd5e computed with the item count", () => {
      const effect = makeEffect(armor, [{ key: AC, mode: 2, value: "@sc.sockets.gems" }]);

      const corrected = SocketEffectFormulaService.correctAttributions(rollActor, AC, [
        { value: 3, document: effect, mode: 2 }
      ]);

      assert.equal(corrected.length, 1);
      assert.equal(corrected[0].value, 2);
    });

    test("leaves an actor-scoped change alone", () => {
      const effect = makeEffect(armor, [{ key: AC, mode: 2, value: "@sc.sockets.actor.gems" }]);

      const corrected = SocketEffectFormulaService.correctAttributions(rollActor, AC, [
        { value: 3, document: effect, mode: 2 }
      ]);

      assert.equal(corrected[0].value, 3);
    });

    test("corrects only the socket part of a mixed change", () => {
      const effect = makeEffect(armor, [{ key: AC, mode: 2, value: "@sc.sockets.gems + 1" }]);

      const corrected = SocketEffectFormulaService.correctAttributions(rollActor, AC, [
        { value: 4, document: effect, mode: 2 }
      ]);

      assert.equal(corrected[0].value, 3);
    });

    test("ignores changes for another property, another mode, or without socket paths", () => {
      const effect = makeEffect(armor, [
        { key: "system.attributes.hp.bonuses.overall", mode: 2, value: "@sc.sockets.gems" },
        { key: AC, mode: 5, value: "@sc.sockets.gems" },
        { key: AC, mode: 2, value: "@abilities.dex.mod" }
      ]);

      const corrected = SocketEffectFormulaService.correctAttributions(rollActor, AC, [
        { value: 3, document: effect, mode: 2 }
      ]);

      assert.equal(corrected[0].value, 3);
    });

    test("adds back an attribution dnd5e dropped for evaluating as zero", () => {
      // The ring has no empty socket, so the item scope applies +2 while the
      // actor totals collapse the value to zero and dnd5e omits it entirely.
      const effect = makeEffect(ring, [{ key: AC, mode: 2, value: "max(0, 2 - @sc.sockets.empty * 2)" }]);

      const corrected = SocketEffectFormulaService.correctAttributions(rollActor, AC, []);

      assert.deepEqual(corrected, [{ value: 2, label: "Socket Bonus", document: effect, mode: 2 }]);
    });

    test("adds back an attribution whose scopes cancel out on the actor", () => {
      const effect = makeEffect(armor, [{ key: AC, mode: 2, value: "@sc.sockets.gems - @sc.sockets.actor.gems" }]);

      const corrected = SocketEffectFormulaService.correctAttributions(rollActor, AC, []);

      assert.equal(corrected.length, 1);
      assert.equal(corrected[0].value, -1);
    });

    test("drops an attribution that corrects down to zero", () => {
      const effect = makeEffect(ring, [{ key: AC, mode: 2, value: "@sc.sockets.empty" }]);
      const kept = { value: 1, label: "Cover", mode: 2 };

      const corrected = SocketEffectFormulaService.correctAttributions(rollActor, AC, [
        kept,
        { value: 1, document: effect, mode: 2 }
      ]);

      assert.deepEqual(corrected, [kept]);
    });

    test("never adds an attribution for an effect dnd5e would not show", () => {
      const value = "max(0, 2 - @sc.sockets.empty * 2)";
      makeEffect(ring, [{ key: AC, mode: 2, value }], { disabled: true });
      makeEffect(ring, [{ key: AC, mode: 2, value }], { isSuppressed: true });
      makeEffect(ring, [{ key: AC, mode: 2, value }], { name: "" });
      // A copied effect is labelled by its source rather than its own name.
      const copied = makeEffect(ring, [{ key: AC, mode: 2, value }], {
        name: "",
        origin: "Actor.other.Item.ring",
        sourceName: "Signet Ring"
      });

      const corrected = SocketEffectFormulaService.correctAttributions(rollActor, AC, []);

      assert.deepEqual(corrected, [{ value: 2, label: "Signet Ring", document: copied, mode: 2 }]);
    });

    test("wraps the dnd5e attribution helper", async () => {
      const service = await freshService();
      const calls = [];
      const effect = { name: "Socket Bonus", parent: armor, changes: [{ key: AC, mode: 2, value: "@sc.sockets.gems" }] };
      class Actor5e {
        _prepareActiveEffectAttributions(target) {
          calls.push(target);
          return [{ value: 3, document: effect, mode: 2 }];
        }
      }
      globalThis.dnd5e = { utils: { simplifyBonus }, documents: { Actor5e } };
      globalThis.CONFIG.ActiveEffect = {
        documentClass: { SHIM_FIELDS: {}, applyChange: () => ({}) }
      };
      game.release = { generation: 14 };

      service.activate();
      const instance = Object.assign(new Actor5e(), {
        documentName: "Actor",
        uuid: "Actor.test",
        items: actor.items,
        allApplicableEffects: () => [effect],
        getRollData: rollActor.getRollData
      });

      assert.deepEqual(instance._prepareActiveEffectAttributions(AC), [
        { value: 2, document: effect, mode: 2 }
      ]);
      assert.deepEqual(calls, [AC]);
    });
  });

  test("registers through libWrapper when it is available", async () => {
    const service = await freshService();
    const registrations = [];
    class ActiveEffect {
      static applyChange() {
        return {};
      }
    }
    globalThis.CONFIG.ActiveEffect = { documentClass: ActiveEffect };
    game.release = { generation: 14 };
    globalThis.libWrapper = {
      register(moduleId, target, wrapper, type) {
        registrations.push({ moduleId, target, type });
      }
    };

    service.activate();

    assert.deepEqual(registrations, [{
      moduleId: Constants.MODULE_ID,
      target: "CONFIG.ActiveEffect.documentClass.applyChange",
      type: "WRAPPER"
    }]);
  });
});
