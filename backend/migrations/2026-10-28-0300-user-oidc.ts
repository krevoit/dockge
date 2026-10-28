// Superseded: single sign-on always logs in as the admin user, so users no longer need OIDC columns.
// Kept so databases that already ran it don't report a missing migration; 2026-10-28-0400 removes the columns.

export async function up() : Promise<void> {
}

export async function down() : Promise<void> {
}
