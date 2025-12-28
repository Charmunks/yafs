export async function up(knex) {
  return knex.schema.createTable("files", (table) => {
    table.increments("id").primary();
    table.string("filename", 255).notNullable();
    table.string("folder", 255);
    table.string("path", 500).notNullable();
    table.integer("ownerId").unsigned().references("id").inTable("users").onDelete("CASCADE");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  return knex.schema.dropTable("files");
}
