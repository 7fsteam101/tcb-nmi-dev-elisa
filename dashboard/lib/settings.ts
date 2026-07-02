import { sql } from "./db";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await sql`select value from core.app_setting where key = ${key}`;
  return rows.length ? (rows[0].value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await sql`
    insert into core.app_setting(key, value) values (${key}, ${sql.json(value as never)})
    on conflict (key) do update set value = excluded.value`;
}

/** Demo mode: true → dashboards read the obviously-fake DEMO rows; false → real data only. */
export async function isDemoMode(): Promise<boolean> {
  return getSetting<boolean>("demo_mode", true);
}

export async function reportTimezone(): Promise<string> {
  return getSetting<string>("report_timezone", "America/New_York");
}
