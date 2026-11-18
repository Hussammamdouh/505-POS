import { useApp } from '@/store/app';

import { fetchOpenOrders } from './orderActions';
import type { Order } from './types';

const POLL_INTERVAL_MS = 5000;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

export async function refreshOpenOrders() {
  const { session, connectivity } = useApp.getState();
  if (inFlight || !session?.token || connectivity === 'offline') {
    return;
  }

  inFlight = true;
  try {
    useApp.getState().set({ openOrders: await fetchOpenOrders() });
  } catch {
    return;
  } finally {
    inFlight = false;
  }
}

export function upsertOpenOrder(order: Order) {
  const stillOpen = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  const others = useApp.getState().openOrders.filter((candidate) => candidate.id !== order.id);
  useApp.getState().set({ openOrders: stillOpen ? [...others, order] : others });
}

export function startLiveOrders() {
  if (timer) {
    return;
  }

  void refreshOpenOrders();
  timer = setInterval(() => void refreshOpenOrders(), POLL_INTERVAL_MS);
}

export function stopLiveOrders() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  useApp.getState().set({ openOrders: [] });
}
