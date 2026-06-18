export class ScMoreActivitiesSocketSlotActivityData extends dnd5e.dataModels.activity.BaseActivityData {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      ...super.defineSchema(),
      slot: new fields.SchemaField({
        color: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        cursorImage: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        condition: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        targetCondition: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        deleteGemOnRemoval: new fields.BooleanField({
          required: false,
          initial: false
        }),
        ignoreMaxSockets: new fields.BooleanField({
          required: false,
          initial: false
        }),
        description: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        hidden: new fields.BooleanField({
          required: false,
          initial: false
        }),
        name: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        operation: new fields.StringField({
          required: false,
          initial: "add",
          choices: ["add", "remove-empty"]
        })
      })
    };
  }
}
