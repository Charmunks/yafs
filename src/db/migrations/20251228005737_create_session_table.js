export async function up(knex) {
  return knex.schema.createTable("session", (table) => {
    table.string("sid").primary();
    table.json("sess").notNullable();
    table.timestamp("expire", { precision: 6 }).notNullable();
    table.index("expire", "IDX_session_expire");
  });
}

export async function down(knex) {
  return knex.schema.dropTable("session");
}
