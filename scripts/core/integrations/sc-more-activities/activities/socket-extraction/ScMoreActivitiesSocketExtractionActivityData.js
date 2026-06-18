export class ScMoreActivitiesSocketExtractionActivityData extends dnd5e.dataModels.activity.BaseActivityData {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      ...super.defineSchema(),
      extraction: new fields.SchemaField({
        cursorImage: new fields.StringField({
          required: false,
          blank: true,
          initial: ""
        }),
        mode: new fields.StringField({
          required: false,
          initial: "keep",
          choices: ["keep", "delete"]
        })
      })
    };
  }
}
