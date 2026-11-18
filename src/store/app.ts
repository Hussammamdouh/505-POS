import { create } from 'zustand';

import type { StaffSession } from '@/lib/auth';
import type { HeldOrder } from '@/lib/heldOrders';
import type { CartLine } from '@/lib/pricing';
import type { DeviceSettings } from '@/lib/settings';
import type { CatalogCategory, Order } from '@/lib/types';

export type Connectivity = 'unknown' | 'online' | 'offline';

/** What a manager or admin signed in for: the register (everything) or the back office (no Register or Website tabs). */
export type Workspace = 'register' | 'system';

export interface CachedShift {
  id: string;
  staffName: string;
  openedAt: string;
}

interface AppState {
  ready: boolean;
  settings: DeviceSettings | null;
  session: StaffSession | null;
  workspace: Workspace;
  connectivity: Connectivity;
  catalog: CatalogCategory[];
  catalogUpdatedAt: string | null;
  /** Items sold per menu item over the last 30 days, so the register shows the favourites first. */
  popularity: Record<string, number>;
  shift: CachedShift | null;
  unsyncedCount: number;
  syncNeedsLogin: boolean;
  /** Shown on the sign-in screen after a background sign-in check signed someone out. */
  loginNotice: string | null;
  openOrders: Order[];

  cart: CartLine[];
  customerName: string;
  customerPhone: string;
  promoCode: string;
  orderNotes: string;
  /** Unpaid orders put aside on the register, newest first. */
  heldOrders: HeldOrder[];

  set: (partial: Partial<AppState>) => void;
  addToCart: (line: CartLine) => void;
  changeQuantity: (key: string, delta: number) => void;
  removeFromCart: (key: string) => void;
  replaceLine: (key: string, line: CartLine) => void;
  clearCart: () => void;
}

export const useApp = create<AppState>((set) => ({
  ready: false,
  settings: null,
  session: null,
  workspace: 'register',
  connectivity: 'unknown',
  catalog: [],
  catalogUpdatedAt: null,
  popularity: {},
  shift: null,
  unsyncedCount: 0,
  syncNeedsLogin: false,
  loginNotice: null,
  openOrders: [],

  cart: [],
  customerName: '',
  customerPhone: '',
  promoCode: '',
  orderNotes: '',
  heldOrders: [],

  set: (partial) => set(partial),

  addToCart: (line) =>
    set((state) => {
      const existing = state.cart.find((candidate) => candidate.key === line.key);
      return {
        cart: existing
          ? state.cart.map((candidate) =>
              candidate.key === line.key ? { ...candidate, quantity: Math.min(100, candidate.quantity + line.quantity) } : candidate,
            )
          : [...state.cart, line],
      };
    }),

  changeQuantity: (key, delta) =>
    set((state) => ({
      cart: state.cart
        .map((line) => (line.key === key ? { ...line, quantity: Math.min(100, line.quantity + delta) } : line))
        .filter((line) => line.quantity > 0),
    })),

  removeFromCart: (key) => set((state) => ({ cart: state.cart.filter((line) => line.key !== key) })),

  replaceLine: (key, line) =>
    set((state) => {
      const others = state.cart.filter((candidate) => candidate.key !== key);
      const duplicate = others.find((candidate) => candidate.key === line.key);
      if (duplicate) {
        return {
          cart: others.map((candidate) =>
            candidate.key === line.key ? { ...candidate, quantity: Math.min(100, candidate.quantity + line.quantity) } : candidate,
          ),
        };
      }

      const index = state.cart.findIndex((candidate) => candidate.key === key);
      const next = [...others];
      next.splice(index < 0 ? next.length : index, 0, line);
      return { cart: next };
    }),

  clearCart: () => set({ cart: [], customerName: '', customerPhone: '', promoCode: '', orderNotes: '' }),
}));

export const canManage = (session: StaffSession | null) => session?.role === 'MANAGER' || session?.role === 'ADMIN';

export const isAdmin = (session: StaffSession | null) => session?.role === 'ADMIN';

export const homeFor = (workspace: Workspace) => (workspace === 'system' ? '/reports/today' : '/register');
