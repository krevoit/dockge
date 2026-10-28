import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    // Users created by single sign-on are identified by issuer + subject, never by username
    return knex.schema.alterTable("user", (table) => {
        table.string("oidc_issuer", 255).nullable();
        table.string("oidc_subject", 255).nullable();
        table.unique([ "oidc_issuer", "oidc_subject" ]);
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.alterTable("user", (table) => {
        table.dropUnique([ "oidc_issuer", "oidc_subject" ]);
        table.dropColumn("oidc_issuer");
        table.dropColumn("oidc_subject");
    });
}
