import { useApp } from '@/store/app';

import { ApiError, apiRequest, describeError, NetworkError } from './api';
import { isExpired, usableSyncToken } from './auth';
import { refreshOffers } from './discounts';
import { syncClockEvents } from './offlineClock';
import { refreshCatalog } from './catalog';
import { outboxDue, outboxMarkSynced, outboxRecordFailure, outboxUnsyncedCount } from './db';
import { fromServerOrder } from './localOrder';
import type { Order } from './types';

const SYNC_INTERVAL_MS = 15000;

let current: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

let pauses = 0;

export async function withSyncPaused<T>(task: () => Promise<T>): Promise<T> {
  pauses++;
  try {
    await current;
    return await task();
  } finally {
    pauses--;
  }
}

export async function refreshSyncCount() {
  useApp.getState().set({ unsyncedCount: await outboxUnsyncedCount() });
}

async function syncToken(): Promise<string | null> {
  const sessionToken = useApp.getState().session?.token;
  if (sessionToken && !isExpired(sessionToken)) {
    return sessionToken;
  }

  return usableSyncToken();
}

export function runSync(): Promise<void> {
  if (pauses > 0) {
    return Promise.resolve();
  }

  current ??= Promise.all([syncDueOrders(), syncOfflineClock()])
    .then(() => undefined)
    .finally(() => {
      current = null;
    });
  return current;
}

// Clock-ins and outs saved while offline go up with whoever is signed in; a failure just waits for the next sync.
async function syncOfflineClock(): Promise<void> {
  const token = await syncToken();
  if (token) {
    await syncClockEvents(token).catch(() => undefined);
  }
}

async function syncDueOrders(): Promise<void> {
  try {
    const due = await outboxDue();
    if (due.length === 0) {
      return;
    }

    const token = await syncToken();
    if (!token) {
      useApp.getState().set({ syncNeedsLogin: true });
      return;
    }

    useApp.getState().set({ syncNeedsLogin: false });
    for (const entry of due) {
      try {
        const order = await apiRequest<Order>('PUT', `/api/v1/orders/pos/${entry.id}`, { body: entry.request, token });
        await outboxMarkSynced(entry.id, order.displayCode, fromServerOrder(order, entry.snapshot.cashierName));
      } catch (error) {
        if (error instanceof NetworkError) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          useApp.getState().set({ syncNeedsLogin: true });
          return;
        }

        const transient = error instanceof ApiError && (error.status === 409 || error.status === 429 || error.status >= 500);
        await outboxRecordFailure(entry.id, describeError(error), !transient);
        if (transient && error instanceof ApiError && error.status >= 500) {
          return;
        }
      }
    }
  } finally {
    await refreshSyncCount();
  }
}

async function heartbeat() {
  const { connectivity, unsyncedCount, settings } = useApp.getState();
  if (!settings) {
    return;
  }

  if (connectivity !== 'online') {
    await refreshCatalog().catch(() => undefined);
  }

  // Keep this week's offers on the iPad, so they still apply if the internet drops.
  if (useApp.getState().connectivity === 'online' && useApp.getState().session?.token) {
    await refreshOffers().catch(() => undefined);
  }

  if (useApp.getState().connectivity === 'online' && unsyncedCount > 0) {
    await runSync();
  }
}

export function startSyncLoop() {
  if (timer) {
    return;
  }

  timer = setInterval(() => void heartbeat(), SYNC_INTERVAL_MS);
  void heartbeat();
}

export function stopSyncLoop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
