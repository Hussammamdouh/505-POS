// Web build storage. The browser version is served over plain HTTP (so it can send receipts straight to
// the printer), and on an insecure origin Safari turns off the storage expo-sqlite needs (OPFS and
// SharedArrayBuffer). localStorage still works there, so the kv table and the order outbox live in it,
// one key per value. Same exports and behaviour as db.ts.
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

interface StoredOutboxEntry extends OutboxEntry {
  syncedAt: string | null;
}

const KV_PREFIX = 'cafe-pos:kv:';
const OUTBOX_PREFIX = 'cafe-pos:outbox:';

function storage(): Storage {
  const store = globalThis.localStorage;
  if (!store) {
    throw new Error('This browser has no local storage, so the register cannot keep orders offline.');
  }

  return store;
}

function write(key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch (error) {
    // Safari throws QuotaExceededError when the ~5 MB budget is used up; say so instead of failing silently.
    throw new Error(`Couldn't save on this iPad (browser storage is full or blocked): ${(error as Error).message}`);
  }
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const value = storage().getItem(KV_PREFIX + key);
  return value === null ? null : (JSON.parse(value) as T);
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  write(KV_PREFIX + key, JSON.stringify(value));
}

export async function kvDelete(key: string): Promise<void> {
  storage().removeItem(KV_PREFIX + key);
}

function readEntry(id: string): StoredOutboxEntry | null {
  const value = storage().getItem(OUTBOX_PREFIX + id);
  return value === null ? null : (JSON.parse(value) as StoredOutboxEntry);
}

function saveEntry(entry: StoredOutboxEntry) {
  write(OUTBOX_PREFIX + entry.id, JSON.stringify(entry));
}

function updateEntry(id: string, change: (entry: StoredOutboxEntry) => StoredOutboxEntry) {
  const entry = readEntry(id);
  if (entry) {
    saveEntry(change(entry));
  }
}

function allEntries(): StoredOutboxEntry[] {
  const store = storage();
  const entries: StoredOutboxEntry[] = [];
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index);
    if (key?.startsWith(OUTBOX_PREFIX)) {
      const value = store.getItem(key);
      if (value !== null) {
        entries.push(JSON.parse(value) as StoredOutboxEntry);
      }
    }
  }

  return entries;
}

const byCreated = (a: OutboxEntry, b: OutboxEntry) => a.createdAt.localeCompare(b.createdAt);

const toEntry = ({ syncedAt: _syncedAt, ...entry }: StoredOutboxEntry): OutboxEntry => entry;

export async function outboxInsert(entry: Pick<OutboxEntry, 'id' | 'createdAt' | 'businessDate' | 'request' | 'snapshot'>) {
  if (readEntry(entry.id)) {
    throw new Error(`Order ${entry.id} is already saved on this iPad.`);
  }

  saveEntry({
    id: entry.id,
    status: 'SUBMITTING',
    offlineCode: entry.request.offline?.offlineCode ?? null,
    displayCode: null,
    createdAt: entry.createdAt,
    businessDate: entry.businessDate,
    request: entry.request,
    snapshot: entry.snapshot,
    attempts: 0,
    lastError: null,
    syncedAt: null,
  });
}

export async function outboxGet(id: string): Promise<OutboxEntry | null> {
  const entry = readEntry(id);
  return entry ? toEntry(entry) : null;
}

export async function outboxReplace(id: string, request: SubmitPosOrderRequest, snapshot: LocalOrder) {
  updateEntry(id, (entry) => ({ ...entry, request, snapshot, offlineCode: request.offline?.offlineCode ?? null }));
}

export async function outboxDelete(id: string) {
  storage().removeItem(OUTBOX_PREFIX + id);
}

export async function outboxDue(): Promise<OutboxEntry[]> {
  return allEntries()
    .filter((entry) => entry.status === 'PENDING')
    .sort(byCreated)
    .map(toEntry);
}

export async function outboxMarkSynced(id: string, displayCode: string, snapshot: LocalOrder) {
  updateEntry(id, (entry) => ({
    ...entry,
    status: 'SYNCED',
    displayCode,
    snapshot,
    lastError: null,
    syncedAt: new Date().toISOString(),
  }));
}

export async function outboxRecordFailure(id: string, error: string, permanent: boolean) {
  updateEntry(id, (entry) => ({
    ...entry,
    attempts: entry.attempts + 1,
    lastError: error,
    status: permanent ? 'FAILED' : 'PENDING',
  }));
}

export async function outboxRecoverInterrupted() {
  for (const entry of allEntries()) {
    if (entry.status === 'SUBMITTING') {
      saveEntry({ ...entry, status: 'PENDING' });
    }
  }
}

export async function outboxRetry(id: string) {
  updateEntry(id, (entry) => ({ ...entry, status: 'PENDING', lastError: null }));
}

export async function outboxForDate(businessDate: string): Promise<OutboxEntry[]> {
  return allEntries()
    .filter((entry) => entry.businessDate === businessDate)
    .sort((a, b) => byCreated(b, a))
    .map(toEntry);
}

export async function outboxUnsyncedCount(): Promise<number> {
  return allEntries().filter((entry) => entry.status !== 'SYNCED').length;
}

export async function outboxPruneSynced(olderThanBusinessDate: string) {
  for (const entry of allEntries()) {
    if (entry.status === 'SYNCED' && entry.businessDate < olderThanBusinessDate) {
      storage().removeItem(OUTBOX_PREFIX + entry.id);
    }
  }
}
