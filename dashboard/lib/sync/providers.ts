import { sql } from "../db";

export type Provider = "ghl" | "close" | "stripe" | "nmi" | "meta";

// One row per connected account (sync.connections). Tokens live in Supabase
// Vault; connections hold only a reference. Env vars act as a bootstrap
// fallback so the first connector can go live before the vault flow is used.
const ENV_FALLBACK: Record<string, string | undefined> = {
  close: process.env.CLOSE_API_KEY,
  meta: process.env.META_ACCESS_TOKEN,
};

export async function listConnections() {
  return sql`
    select id, provider, external_account_id, account_label, status,
           last_synced_at, last_error, created_at
    from sync.connections order by provider, created_at`;
}

export async function getConnection(provider: Provider, externalAccountId?: string) {
  const rows = externalAccountId
    ? await sql`select * from sync.connections where provider = ${provider} and external_account_id = ${externalAccountId} limit 1`
    : await sql`select * from sync.connections where provider = ${provider} and status = 'connected' order by created_at limit 1`;
  return rows[0] ?? null;
}

/** Store an API key in Vault and upsert the connection row. */
export async function saveProviderKey(provider: Provider, key: string, accountId: string, label: string) {
  const [secret] = await sql`select vault.create_secret(${key}, ${`${provider}:${accountId}`}) as id`;
  await sql`
    insert into sync.connections (provider, external_account_id, account_label, status, token_secret_ref)
    values (${provider}, ${accountId}, ${label}, 'connected', ${secret.id})
    on conflict (provider, external_account_id)
    do update set token_secret_ref = excluded.token_secret_ref, status = 'connected', last_error = null`;
}

/** Resolve the live token for a provider: connection vault secret, else env fallback. */
export async function getProviderToken(provider: Provider, externalAccountId?: string): Promise<string | null> {
  const conn = await getConnection(provider, externalAccountId);
  if (conn?.token_secret_ref) {
    const rows = await sql`
      select decrypted_secret from vault.decrypted_secrets where id = ${conn.token_secret_ref}`;
    if (rows.length) return rows[0].decrypted_secret;
  }
  return ENV_FALLBACK[provider] ?? null;
}

export async function markSynced(connectionId: string, error?: string) {
  await sql`
    update sync.connections
    set last_synced_at = case when ${error ?? null}::text is null then now() else last_synced_at end,
        last_error = ${error ?? null},
        status = case when ${error ?? null}::text is null then 'connected'::sync.connection_status else 'error'::sync.connection_status end
    where id = ${connectionId}`;
}

/** Ensure a connection row exists for inbound webhooks that arrive before any key is saved. */
export async function ensureConnection(provider: Provider, externalAccountId: string, label: string) {
  const rows = await sql`
    insert into sync.connections (provider, external_account_id, account_label, status)
    values (${provider}, ${externalAccountId}, ${label}, 'connected')
    on conflict (provider, external_account_id) do update set updated_at = now()
    returning id`;
  return rows[0].id as string;
}
