import { useApp } from '@/store/app';

import { kvGet, kvSet } from './db';
import type { CartLine } from './pricing';

// Orders the customer hasn't finished or paid for yet, put aside so the register can serve the
// next person. They live only on this iPad (they are not orders until paid), and are saved so a
// restart or an offline spell doesn't lose them.

export interface HeldOrder {
  id: string;
  /** The customer's name, or "Order 2" when none was given. */
  label: string;
  cart: CartLine[];
  customerName: string;
  customerPhone: string;
  orderNotes: string;
  heldAt: string;
}

const HELD_ORDERS_KEY = 'held-orders';

export async function loadHeldOrders() {
  useApp.getState().set({ heldOrders: (await kvGet<HeldOrder[]>(HELD_ORDERS_KEY)) ?? [] });
}

async function save(heldOrders: HeldOrder[]) {
  useApp.getState().set({ heldOrders });
  await kvSet(HELD_ORDERS_KEY, heldOrders);
}

/** The lowest "Order N" not already used by a held order. */
function nextLabel(heldOrders: HeldOrder[]): string {
  const used = new Set(heldOrders.map((order) => order.label));
  let number = 1;
  while (used.has(`Order ${number}`)) {
    number++;
  }

  return `Order ${number}`;
}

/** Takes the cart off the register as a held order, or returns null when the cart is empty. */
function takeCurrentCart(heldOrders: HeldOrder[]): HeldOrder | null {
  const { cart, customerName, customerPhone, orderNotes, clearCart } = useApp.getState();
  if (cart.length === 0) {
    return null;
  }

  clearCart();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: customerName.trim() || nextLabel(heldOrders),
    cart,
    customerName,
    customerPhone,
    orderNotes,
    heldAt: new Date().toISOString(),
  };
}

export async function holdCurrentOrder() {
  const heldOrders = useApp.getState().heldOrders;
  const held = takeCurrentCart(heldOrders);
  if (held) {
    await save([held, ...heldOrders]);
  }
}

/** Puts a held order back on the register; anything already in the cart is held in its place. */
export async function resumeHeldOrder(id: string) {
  const heldOrders = useApp.getState().heldOrders;
  const target = heldOrders.find((order) => order.id === id);
  if (!target) {
    return;
  }

  const others = heldOrders.filter((order) => order.id !== id);
  const swapped = takeCurrentCart(others);
  useApp.getState().set({
    cart: target.cart,
    customerName: target.customerName,
    customerPhone: target.customerPhone,
    orderNotes: target.orderNotes,
  });
  await save(swapped ? [swapped, ...others] : others);
}

export async function discardHeldOrder(id: string) {
  await save(useApp.getState().heldOrders.filter((order) => order.id !== id));
}
