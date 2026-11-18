import { useApp } from '@/store/app';

import { apiRequest } from './api';
import { kvGet, kvSet } from './db';
import { cachePrintingOptions } from './printing/printer';
import type { CatalogCategory, PrintingOptions } from './types';

const CATALOG_KEY = 'catalog';
const POPULARITY_KEY = 'item-popularity';

interface CachedCatalog {
  categories: CatalogCategory[];
  updatedAt: string;
}

export async function loadCachedCatalog() {
  const [cached, popularity] = await Promise.all([kvGet<CachedCatalog>(CATALOG_KEY), kvGet<Record<string, number>>(POPULARITY_KEY)]);
  if (cached) {
    useApp.getState().set({ catalog: cached.categories, catalogUpdatedAt: cached.updatedAt });
  }

  if (popularity) {
    useApp.getState().set({ popularity });
  }
}

export async function refreshCatalog() {
  const categories = await apiRequest<CatalogCategory[]>('GET', '/api/v1/catalog?channel=pos', { token: null });
  const cached: CachedCatalog = { categories, updatedAt: new Date().toISOString() };
  await kvSet(CATALOG_KEY, cached);
  useApp.getState().set({ catalog: categories, catalogUpdatedAt: cached.updatedAt });
  void refreshPopularity().catch(() => undefined);
}

/** Needs a signed-in token; without one the last saved counts are kept. */
export async function refreshPopularity() {
  if (!useApp.getState().session?.token) {
    return;
  }

  const counts = await apiRequest<{ menuItemId: string; quantity: number }[]>('GET', '/api/v1/orders/popular-items');
  const popularity = Object.fromEntries(counts.map((entry) => [entry.menuItemId, entry.quantity]));
  await kvSet(POPULARITY_KEY, popularity);
  useApp.getState().set({ popularity });
}

/** A category's items with the most ordered first; items that sell the same keep the menu's order. */
export function byPopularity<T extends { id: string }>(items: T[], popularity: Record<string, number>): T[] {
  return items
    .map((item, index) => ({ item, index, sold: popularity[item.id] ?? 0 }))
    .sort((a, b) => b.sold - a.sold || a.index - b.index)
    .map((entry) => entry.item);
}

export async function refreshPrintingOptions() {
  await cachePrintingOptions(await apiRequest<PrintingOptions>('GET', '/api/v1/orders/print/options'));
}
