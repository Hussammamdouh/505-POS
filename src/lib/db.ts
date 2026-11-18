import * as SQLite from 'expo-sqlite';

import type { SubmitPosOrderRequest } from './types';
import type { LocalOrder } from './localOrder';

export type OutboxStatus = 'SUBMITTING' | 'PENDING' | 'SYNCED' | 'FAILED';

export interface OutboxEntry {
  id: string;
  status: OutboxStatus;
  offlineCode: string | null;
  displayCode: string | null;
  createdAt: string;
  businessDate: string;
  request: SubmitPosOrderRequest;
  snapshot: LocalOrder;
  attempts: number;
  lastError: string | null;
}

interface OutboxRow {
  id: string;
  status: OutboxStatus;
  offline_code: string | null;
  display_code: string | null;
  created_at: string;
  business_date: string;
  request_json: string;
  snapshot_json: string;
  attempts: number;
  last_error: string | null;
}

const SCHEMA_VERSION = 1;

let database: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  database ??= SQLite.openDatabaseAsync('cafe-pos.db').then(async (db) => {
    await migrate(db);
    return db;
  });
  return database;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) >= SCHEMA_VERSION) {
    return;
  }

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL,
      offline_code TEXT,
      display_code TEXT,
      created_at TEXT NOT NULL,
      business_date TEXT NOT NULL,
      request_json TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox (status, created_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_business_date ON outbox (business_date, created_at);
    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM kv WHERE key = ?', key);
}

const toEntry = (row: OutboxRow): OutboxEntry => ({
  id: row.id,
  status: row.status,
  offlineCode: row.offline_code,
  displayCode: row.display_code,
  createdAt: row.created_at,
  businessDate: row.business_date,
  request: JSON.parse(row.request_json),
  snapshot: JSON.parse(row.snapshot_json),
  attempts: row.attempts,
  lastError: row.last_error,
});

export async function outboxInsert(entry: Pick<OutboxEntry, 'id' | 'createdAt' | 'businessDate' | 'request' | 'snapshot'>) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO outbox (id, status, offline_code, created_at, business_date, request_json, snapshot_json)
     VALUES (?, 'SUBMITTING', ?, ?, ?, ?, ?)`,
    entry.id,
    entry.request.offline?.offlineCode ?? null,
    entry.createdAt,
    entry.businessDate,
    JSON.stringify(entry.request),
    JSON.stringify(entry.snapshot),
  );
}

export async function outboxGet(id: string): Promise<OutboxEntry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<OutboxRow>('SELECT * FROM outbox WHERE id = ?', id);
  return row ? toEntry(row) : null;
}

export async function outboxReplace(id: string, request: SubmitPosOrderRequest, snapshot: LocalOrder) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE outbox SET request_json = ?, snapshot_json = ?, offline_code = ? WHERE id = ?',
    JSON.stringify(request),
    JSON.stringify(snapshot),
    request.offline?.offlineCode ?? null,
    id,
  );
}

export async function outboxDelete(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
}

export async function outboxDue(): Promise<OutboxEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>("SELECT * FROM outbox WHERE status = 'PENDING' ORDER BY created_at");
  return rows.map(toEntry);
}

export async function outboxMarkSynced(id: string, displayCode: string, snapshot: LocalOrder) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE outbox SET status = 'SYNCED', display_code = ?, snapshot_json = ?, last_error = NULL, synced_at = ? WHERE id = ?",
    displayCode,
    JSON.stringify(snapshot),
    new Date().toISOString(),
    id,
  );
}

export async function outboxRecordFailure(id: string, error: string, permanent: boolean) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE outbox SET attempts = attempts + 1, last_error = ?, status = ? WHERE id = ?',
    error,
    permanent ? 'FAILED' : 'PENDING',
    id,
  );
}

export async function outboxRecoverInterrupted() {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET status = 'PENDING' WHERE status = 'SUBMITTING'");
}

export async function outboxRetry(id: string) {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET status = 'PENDING', last_error = NULL WHERE id = ?", id);
}

export async function outboxForDate(businessDate: string): Promise<OutboxEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    'SELECT * FROM outbox WHERE business_date = ? ORDER BY created_at DESC',
    businessDate,
  );
  return rows.map(toEntry);
}

export async function outboxUnsyncedCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM outbox WHERE status <> 'SYNCED'");
  return row?.count ?? 0;
}

export async function outboxPruneSynced(olderThanBusinessDate: string) {
  const db = await getDb();
  await db.runAsync("DELETE FROM outbox WHERE status = 'SYNCED' AND business_date < ?", olderThanBusinessDate);
}
