export function up(knex) {
  return knex.schema.alterTable("users", (table) => {
    table.boolean("is_admin").notNullable().defaultTo(false);
  });
}

export function down(knex) {
  return knex.schema.alterTable("users", (table) => {
    table.dropColumn("is_admin");
  });
}
