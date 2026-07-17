/**
 * Shared schema for the recharge-style activities (socket-recharge and
 * socket-pool-recharge). Both configure the same fields: an optional cursor
 * image, an optional restore formula (blank = full recharge), an optional
 * resource key filter, and an optional ability/skill check gate.
 */
export const buildRechargeSchema = () => {
  const fields = foundry.data.fields;
  const FormulaField = dnd5e.dataModels?.fields?.FormulaField ?? fields.StringField;

  return new fields.SchemaField({
    cursorImage: new fields.StringField({
      required: false,
      blank: true,
      initial: ""
    }),
    formula: new fields.StringField({
      required: false,
      blank: true,
      initial: ""
    }),
    resourceKey: new fields.StringField({
      required: false,
      blank: true,
      initial: ""
    }),
    check: new fields.SchemaField({
      type: new fields.StringField({
        required: false,
        initial: "none",
        choices: ["none", "ability", "skill"]
      }),
      ability: new fields.StringField({
        required: false,
        blank: true,
        initial: "int"
      }),
      skill: new fields.StringField({
        required: false,
        blank: true,
        initial: "arc"
      }),
      dc: new FormulaField({
        required: false,
        blank: true,
        deterministic: true,
        initial: "10"
      })
    })
  });
};
