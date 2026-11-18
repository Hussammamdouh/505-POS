import { useApp, type CachedShift } from '@/store/app';

import { configureApi } from './api';
import { fetchStaffTiles } from './auth';
import { businessDateOf } from './businessDay';
import { loadCachedCatalog, refreshCatalog } from './catalog';
import { kvGet, outboxPruneSynced, outboxRecoverInterrupted } from './db';
import { loadHeldOrders } from './heldOrders';
import { loadSettings } from './settings';
import { SHIFT_KEY } from './shift';
import { refreshSyncCount, runSync, startSyncLoop } from './sync';

const KEEP_SYNCED_DAYS = 7;

export async function bootstrap() {
  configureApi({
    getBaseUrl: () => useApp.getState().settings?.apiBaseUrl ?? null,
    getToken: () => useApp.getState().session?.token ?? null,
    onReachability: (reachable) => {
      const previous = useApp.getState().connectivity;
      useApp.getState().set({ connectivity: reachable ? 'online' : 'offline' });
      if (reachable && previous !== 'online') {
        void runSync();
      }
    },
    onUnauthorized: () => {
      const { session } = useApp.getState();
      useApp.getState().set({ session: session ? { ...session, token: null } : null, syncNeedsLogin: true });
    },
  });

  const [settings, shift] = await Promise.all([loadSettings(), kvGet<CachedShift>(SHIFT_KEY)]);
  useApp.getState().set({ settings, shift });

  await outboxRecoverInterrupted();
  await loadCachedCatalog();
  await loadHeldOrders();
  await outboxPruneSynced(businessDateOf(new Date(Date.now() - KEEP_SYNCED_DAYS * 24 * 60 * 60 * 1000)));
  await refreshSyncCount();

  useApp.getState().set({ ready: true });

  if (settings) {
    void refreshCatalog().catch(() => undefined);
    void fetchStaffTiles().catch(() => undefined);
  }

  startSyncLoop();
}
