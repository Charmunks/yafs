export async function up(knex) {
  return knex.schema.createTable("folder_descriptions", (table) => {
    table.increments("id").primary();
    table.string("folder").notNullable();
    table.integer("ownerId").unsigned().references("id").inTable("users").onDelete("CASCADE");
    table.text("description");
    table.timestamps(true, true);
    table.unique(["folder", "ownerId"]);
  });
}

export async function down(knex) {
  return knex.schema.dropTable("folder_descriptions");
}
