export class ScMoreActivitiesGemReloadActivityData extends dnd5e.dataModels.activity.BaseActivityData {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      ...super.defineSchema(),
      reload: new fields.SchemaField({
        targetMode: new fields.StringField({
          required: false,
          initial: "select",
          choices: ["select", "self"]
        }),
        cursorImage: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        gemMode: new fields.StringField({
          required: false,
          initial: "prompt",
          choices: ["prompt", "name", "match"]
        }),
        gemQuery: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        slotMode: new fields.StringField({
          required: false,
          initial: "ordered",
          choices: ["ordered", "prompt"]
        })
      })
    };
  }
}
