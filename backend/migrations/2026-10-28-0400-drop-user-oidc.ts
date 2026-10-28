import { Knex } from "knex";

/**
 * Remove the per-user OIDC columns (and the users created by single sign-on) added by the first
 * single sign-on release, where 2026-10-28-0300 created them. A no-op everywhere else.
 */
export async function up(knex: Knex): Promise<void> {
    if (!await knex.schema.hasColumn("user", "oidc_subject")) {
        return;
    }
    await knex("user").whereNotNull("oidc_subject").del();
    // SQLite can't drop a column that is part of an index
    await knex.raw("DROP INDEX IF EXISTS user_oidc_issuer_oidc_subject_unique");
    await knex.raw("ALTER TABLE user DROP COLUMN oidc_subject");
    await knex.raw("ALTER TABLE user DROP COLUMN oidc_issuer");
}

export async function down(): Promise<void> {
}
