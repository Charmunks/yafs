export async function up(knex) {
  return knex.schema.alterTable("files", (table) => {
    table.text("description");
  });
}

export async function down(knex) {
  return knex.schema.alterTable("files", (table) => {
    table.dropColumn("description");
  });
}
