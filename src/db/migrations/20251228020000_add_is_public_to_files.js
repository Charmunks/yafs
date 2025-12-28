export async function up(knex) {
  return knex.schema.alterTable("files", (table) => {
    table.boolean("isPublic").defaultTo(false).notNullable();
  });
}

export async function down(knex) {
  return knex.schema.alterTable("files", (table) => {
    table.dropColumn("isPublic");
  });
}
