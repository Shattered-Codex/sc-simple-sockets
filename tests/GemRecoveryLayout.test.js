import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

const readProjectFile = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8"
);

function cssDeclarations(source, selector) {
  const marker = `${selector} {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing CSS rule: ${selector}`);

  const bodyStart = start + marker.length;
  const bodyEnd = source.indexOf("}", bodyStart);
  assert.notEqual(bodyEnd, -1, `unterminated CSS rule: ${selector}`);

  return source
    .slice(bodyStart, bodyEnd)
    .replace(/\s+/g, " ")
    .trim();
}

function assertDeclaration(source, selector, declaration) {
  const declarations = cssDeclarations(source, selector);
  assert.ok(
    declarations.includes(declaration),
    `${selector} should contain "${declaration}", got "${declarations}"`
  );
}

describe("gem recovery field layout", () => {
  test("standard and Tidy details templates expose the recovery-period layout modifier", () => {
    const expectedClass = [
      "sc-sockets-gem-resource-recovery",
      "{{#if details.resource.recovery.isRecharge}}is-recharge{{else}}is-periodic{{/if}}"
    ].join(" ");

    for (const templatePath of [
      "templates/gem-details-tab.hbs",
      "templates/tidy/gem-details-tab.hbs"
    ]) {
      const template = readProjectFile(templatePath).replace(/\s+/g, " ");
      assert.ok(
        template.includes(expectedClass),
        `${templatePath} should select the recharge or periodic grid`
      );
    }
  });

  test("periodic recovery keeps Recovery on row one and gives Formula its own row", () => {
    const css = readProjectFile("css/socket-consumption.css");

    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-row.sc-sockets-gem-resource-recovery.is-periodic",
      "grid-template-columns: 7rem minmax(0, 1fr);"
    );
    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-recovery.is-periodic .sc-sockets-gem-resource-recovery-period",
      "grid-column: 1;"
    );
    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-recovery.is-periodic .sc-sockets-gem-resource-recovery-type",
      "grid-column: 2;"
    );
    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-recovery.is-periodic .sc-sockets-gem-resource-recovery-formula",
      "grid-column: 1 / -1;"
    );
  });

  test("Recharge places Recovery and Formula together after period and threshold", () => {
    const css = readProjectFile("css/socket-consumption.css");

    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-row.sc-sockets-gem-resource-recovery.is-recharge",
      "grid-template-columns: 7rem minmax(0, 1fr) auto;"
    );
    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-recovery.is-recharge .sc-sockets-gem-resource-recovery-period",
      "grid-column: 1 / 3;"
    );
    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-recovery.is-recharge .sc-sockets-gem-resource-recovery-threshold",
      "grid-column: 3;"
    );
    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-recovery.is-recharge .sc-sockets-gem-resource-recovery-type",
      "grid-column: 1;"
    );
    assertDeclaration(
      css,
      ".sc-sockets-gem-resource-recovery.is-recharge .sc-sockets-gem-resource-recovery-formula",
      "grid-column: 2 / -1;"
    );
  });

  test("slot config uses the same dynamic two-row recovery grid", () => {
    const template = readProjectFile("templates/socket-slot-config.hbs");
    const css = readProjectFile("css/socket-slot-config.css");
    const application = readProjectFile("scripts/core/ui/SocketSlotConfigApp.js");

    assert.ok(
      template.includes(
        "slotcfg-recovery-controls {{#if gemRecoveryIsRecharge}}is-recharge{{else}}is-periodic{{/if}}"
      ),
      "slot config should select the recharge or periodic grid"
    );
    assertDeclaration(
      css,
      ".socket-slot-config-app .slotcfg-recovery-controls.is-periodic .slotcfg-recovery-formula",
      "grid-column: 1 / -1;"
    );
    assertDeclaration(
      css,
      ".socket-slot-config-app .slotcfg-recovery-controls.is-recharge .slotcfg-recovery-type",
      "grid-column: 1;"
    );
    assertDeclaration(
      css,
      ".socket-slot-config-app .slotcfg-recovery-controls.is-recharge .slotcfg-recovery-formula",
      "grid-column: 2 / -1;"
    );
    assert.ok(
      application.includes('controls.classList.toggle("is-recharge", isRecharge)'),
      "slot config should update the recharge grid immediately when the period changes"
    );
    assert.ok(
      application.includes('controls.classList.toggle("has-formula", hasFormula)'),
      "slot config should update the formula grid immediately when the recovery type changes"
    );
  });
});
