export function up(knex) {
  return knex.schema.createTable("settings", (table) => {
    table.string("key").primary();
    table.string("value").notNullable();
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  }).then(() => {
    return knex("settings").insert({
      key: "registration_enabled",
      value: "true"
    });
  });
}

export function down(knex) {
  return knex.schema.dropTable("settings");
}
