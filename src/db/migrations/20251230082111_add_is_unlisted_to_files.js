export function up(knex) {
  return knex.schema.alterTable("files", (table) => {
    table.boolean("isUnlisted").defaultTo(false);
  });
}

export function down(knex) {
  return knex.schema.alterTable("files", (table) => {
    table.dropColumn("isUnlisted");
  });
}
