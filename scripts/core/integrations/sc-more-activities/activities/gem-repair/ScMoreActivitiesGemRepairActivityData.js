import { GemCheckService } from "../../../../services/GemCheckService.js";

export class ScMoreActivitiesGemRepairActivityData extends dnd5e.dataModels.activity.BaseActivityData {
  static defineSchema() {
    const fields = foundry.data.fields;
    const FormulaField = dnd5e.dataModels?.fields?.FormulaField ?? fields.StringField;

    const rarityDcs = Object.fromEntries(GemCheckService.RARITY_KEYS.map((key) => [
      key,
      new fields.NumberField({
        required: false,
        nullable: false,
        integer: true,
        min: 0,
        initial: GemCheckService.DEFAULT_RARITY_DCS[key]
      })
    ]));

    return {
      ...super.defineSchema(),
      repair: new fields.SchemaField({
        check: new fields.SchemaField({
          type: new fields.StringField({
            required: false,
            initial: GemCheckService.TYPE_NONE,
            choices: [GemCheckService.TYPE_NONE, ...GemCheckService.CHECK_TYPES]
          }),
          ability: new fields.StringField({
            required: false,
            blank: true,
            initial: "dex"
          }),
          skill: new fields.StringField({
            required: false,
            blank: true,
            initial: "arc"
          }),
          tool: new fields.StringField({
            required: false,
            blank: true,
            initial: "jeweler"
          }),
          dcMode: new fields.StringField({
            required: false,
            initial: GemCheckService.DC_MODE_FIXED,
            choices: [...GemCheckService.DC_MODES]
          }),
          dc: new fields.NumberField({
            required: false,
            nullable: false,
            integer: true,
            min: 0,
            initial: GemCheckService.DEFAULT_DC
          }),
          formula: new FormulaField({
            required: false,
            blank: true,
            deterministic: true,
            initial: GemCheckService.DEFAULT_DC_FORMULA
          }),
          rarity: new fields.SchemaField(rarityDcs)
        })
      })
    };
  }
}
