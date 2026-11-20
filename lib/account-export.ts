import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_NAME, ENTRY_PAGE_MAX_REQUESTS, ENTRY_PAGE_SIZE, TABLES } from "./constants.ts";

/**
 * The whole account as one JSON file -- what the privacy policy means by
 * "download your data". Everything is read fresh with select("*"), not taken
 * from the screen's state: that state has been reshaped for display, and some
 * tables carry columns the screen never loads.
 *
 * Not restorable yet; `format` and `version` are there so an importer can say
 * no to a file it does not understand.
 */
export const ACCOUNT_EXPORT_FORMAT = "nubmon-account-export";
export const ACCOUNT_EXPORT_VERSION = 1;

type Row = Record<string, unknown>;

/**
 * Tables that are the user's own data, in file order. ai_chat_messages,
 * privacy_acknowledgements and the AI quota counter are left out on purpose:
 * chat history is a convenience, the other two are the app's own records.
 */
const EXPORT_TABLES = [
  { key: TABLES.transactions, order: ["occurred_at", "id"], optional: false },
  { key: TABLES.wallets, order: ["id"], optional: false },
  { key: TABLES.debtors, order: ["id"], optional: false },
  { key: TABLES.recurringExpenses, order: ["id"], optional: false },
  { key: TABLES.investments, order: ["id"], optional: false },
  { key: TABLES.investmentPrices, order: ["id"], optional: false },
  { key: TABLES.budgets, order: ["category"], optional: false },
  { key: TABLES.moneyGoals, order: ["id"], optional: false },
  // A project that has not had the pocket_cards migration yet has no table: an
  // empty pocket, the way loadPocketCards reads it.
  { key: TABLES.pocketCards, order: ["id"], optional: true },
  { key: TABLES.profiles, order: ["user_id"], optional: false },
] as const;

/**
 * The only profile columns that leave the device. An allowlist rather than
 * "everything except pin_hash": a secret column added later stays out of the
 * file until someone decides it belongs in it.
 */
export const PROFILE_EXPORT_COLUMNS = [
  "user_id",
  "nickname",
  "app_icon",
  "app_icon_image",
  "month_start_day",
  "net_worth_formula",
  "net_worth_hide_card",
  "ai_context",
  "created_at",
  "updated_at",
] as const;

export type AccountExportTables = Record<(typeof EXPORT_TABLES)[number]["key"], Row[]>;

export type AccountExport = {
  app: string;
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  exportedAt: string;
  userEmail: string | null;
  tables: AccountExportTables;
};

function pickColumns(row: Row, columns: readonly string[]): Row {
  const picked: Row = {};
  for (const column of columns) {
    if (column in row) picked[column] = row[column];
  }
  return picked;
}

export function buildAccountExport(
  data: Partial<Record<keyof AccountExportTables, Row[]>>,
  meta: { exportedAt: Date; userEmail: string | null },
): AccountExport {
  const tables = {} as AccountExportTables;
  for (const { key } of EXPORT_TABLES) {
    tables[key] = data[key] ?? [];
  }
  tables[TABLES.profiles] = tables[TABLES.profiles].map((row) => pickColumns(row, PROFILE_EXPORT_COLUMNS));
  return {
    app: APP_NAME,
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    exportedAt: meta.exportedAt.toISOString(),
    userEmail: meta.userEmail,
    tables,
  };
}

/** Thrown when a table cannot be read -- the file must not be made half-full. */
export class AccountExportError extends Error {}

async function fetchTable(client: SupabaseClient, table: string, order: readonly string[], optional: boolean): Promise<Row[]> {
  const rows: Row[] = [];
  let total: number | null = null;

  for (let request = 0; request < ENTRY_PAGE_MAX_REQUESTS; request += 1) {
    let query = client.from(table).select("*", { count: "exact" });
    // A total order, so a page boundary can neither skip nor repeat a row.
    for (const column of order) query = query.order(column, { ascending: true });
    const { data, error, count } = await query.range(rows.length, rows.length + ENTRY_PAGE_SIZE - 1);

    if (error) {
      if (optional && (error.code === "PGRST205" || error.code === "42P01")) return [];
      throw new AccountExportError(error.message);
    }
    if (count != null) total = count;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (!page.length || total == null || rows.length >= total) return rows;
  }
  // Out of requests with rows still to read: say so instead of writing a file
  // that looks complete and is not.
  throw new AccountExportError(`อ่านข้อมูลจาก ${table} ไม่ครบ`);
}

/** Reads every exported table, or throws -- never returns some of them. */
export async function fetchAccountExport(client: SupabaseClient, userEmail: string | null, now = new Date()): Promise<AccountExport> {
  const results = await Promise.all(EXPORT_TABLES.map(({ key, order, optional }) => fetchTable(client, key, order, optional)));
  const data: Partial<Record<keyof AccountExportTables, Row[]>> = {};
  EXPORT_TABLES.forEach(({ key }, index) => { data[key] = results[index]; });
  return buildAccountExport(data, { exportedAt: now, userEmail });
}

/** nubmon-backup-YYYY-MM-DD.json, the date as it is in Thailand whatever the device's zone. */
export function accountExportFilename(now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `nubmon-backup-${day}.json`;
}
