import { newId } from './ids';

import { useApp } from '@/store/app';

import { ApiError, apiRequest, describeError, NetworkError } from './api';
import { businessDateOf } from './businessDay';
import { discountLabel, type DiscountQuote } from './discounts';
import { refreshCatalog } from './catalog';
import { kvGet, kvSet, outboxDelete, outboxGet, outboxInsert, outboxMarkSynced, outboxReplace, outboxRetry } from './db';
import { balanceDue, fromServerOrder, type LocalOrder, type LocalOrderPayment } from './localOrder';
import { cartSubtotal, lineTotal, toLineRequest, type CartLine } from './pricing';
import { printOrderReceipt } from './printing/printer';
import { refreshSyncCount, runSync, withSyncPaused } from './sync';
import type { Order, PaymentSplit, SubmitPosOrderRequest } from './types';

export interface CheckoutInput {
  lines: CartLine[];
  customerName: string;
  customerPhone: string;
  orderNotes: string;
  payments: LocalOrderPayment[];
  /** The discounts the cashier was shown (offer, free drink, promo code), or null for none. */
  quote: DiscountQuote | null;
}

export interface CheckoutResult {
  order: LocalOrder;
  offline: boolean;
  printError: string | null;
}

export class CheckoutRejected extends Error {
  constructor(
    message: string,
    readonly menuRefreshed: boolean,
  ) {
    super(message);
    this.name = 'CheckoutRejected';
  }
}

const OFFLINE_COUNTER_KEY = 'offline-counter';

export function validatePayments(subtotal: number, payments: LocalOrderPayment[]): string | null {
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (payments.some((payment) => payment.amount <= 0)) {
    return 'Each payment must be more than zero.';
  }

  if (total > subtotal) {
    return 'Payments are more than the order total. Enter extra cash as "tendered" instead.';
  }

  if (payments.some((payment) => payment.amountTendered !== null && payment.amountTendered < payment.amount)) {
    return 'Cash tendered must be at least the payment amount.';
  }

  return null;
}

export async function placeOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const { session, settings, shift, connectivity } = useApp.getState();
  if (!session || !settings) {
    throw new CheckoutRejected('Sign in first.', false);
  }

  const subtotal = cartSubtotal(input.lines);
  const discount = input.quote?.totalDiscount ?? 0;
  const net = subtotal - discount;
  // Customers pay in full when they order.
  const paid = input.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const paymentProblem = paid !== net ? 'The order must be paid in full.' : validatePayments(net, input.payments);
  if (paymentProblem) {
    throw new CheckoutRejected(paymentProblem, false);
  }

  const id = newId();
  const createdAt = new Date().toISOString();
  const request: SubmitPosOrderRequest = {
    customerName: input.customerName.trim() || null,
    customerPhone: input.customerPhone.trim() || null,
    orderNotes: input.orderNotes.trim() || null,
    items: input.lines.map(toLineRequest),
    payments: input.payments.map(toPaymentSplit),
    offline: null,
    promoCode: input.quote?.promoCode ?? null,
    discount: discount / 100,
    offerId: input.quote?.offerId ?? null,
    offerName: input.quote ? discountLabel(input.quote) : null,
  };
  const snapshot = buildSnapshot(id, createdAt, input, subtotal, session.staffId, session.fullName);

  await outboxInsert({ id, createdAt, businessDate: businessDateOf(new Date(createdAt)), request, snapshot });

  let order: LocalOrder | null = null;
  if (connectivity !== 'offline' && session.token) {
    order = await trySubmitOnline(id, request, session.fullName);
  }

  const offline = order === null;
  if (order === null) {
    if (!shift) {
      await outboxDelete(id);
      throw new CheckoutRejected('No shift is open on this iPad, so orders cannot be taken offline. Open a shift when back online.', false);
    }

    const offlineCode = await nextOfflineCode(settings.deviceLetter, createdAt);
    order = { ...snapshot, displayCode: offlineCode, offlineCode };
    await outboxReplace(id, {
      ...request,
      offline: { offlineCode, createdAt, cashierId: session.staffId, shiftSessionId: shift?.id ?? null },
    }, order);
    await outboxRetry(id);
  }

  await refreshSyncCount();

  let printError: string | null = null;
  try {
    await printOrderReceipt(settings, order);
  } catch (error) {
    printError = describeError(error);
  }

  return { order, offline, printError };
}

export async function payExistingOrder(entryId: string, payments: LocalOrderPayment[]): Promise<CheckoutResult> {
  const { settings, shift, session } = useApp.getState();
  if (!settings || !session) {
    throw new CheckoutRejected('Sign in first.', false);
  }

  const { order, offline } = await withSyncPaused(async () => {
    const entry = await outboxGet(entryId);
    if (!entry) {
      throw new CheckoutRejected('This order is no longer on this iPad.', false);
    }

    const problem = validatePayments(balanceDue(entry.snapshot), payments);
    if (problem) {
      throw new CheckoutRejected(problem, false);
    }

    if (entry.status === 'SYNCED') {
      try {
        const updated = await apiRequest<Order>('POST', `/api/v1/orders/${entry.id}/finalize`, {
          body: { payments: payments.map(toPaymentSplit) },
        });
        const synced = fromServerOrder(updated, entry.snapshot.cashierName);
        await outboxMarkSynced(entry.id, updated.displayCode, synced);
        return { order: synced, offline: false };
      } catch (error) {
        throw new CheckoutRejected(
          error instanceof NetworkError ? 'This order is already on the server, so taking payment needs the internet.' : describeError(error),
          false,
        );
      }
    }

    if (!shift) {
      throw new CheckoutRejected('No shift is open on this iPad, so payments cannot be taken offline.', false);
    }

    const pending: LocalOrder = { ...entry.snapshot, payments: [...entry.snapshot.payments, ...payments] };
    await outboxReplace(
      entry.id,
      {
        ...entry.request,
        payments: pending.payments.map(toPaymentSplit),
        offline: entry.request.offline ? { ...entry.request.offline, shiftSessionId: entry.request.offline.shiftSessionId ?? shift.id } : null,
      },
      pending,
    );
    await outboxRetry(entry.id);
    return { order: pending, offline: true };
  });

  await refreshSyncCount();
  void runSync();

  let printError: string | null = null;
  try {
    await printOrderReceipt(settings, order);
  } catch (error) {
    printError = describeError(error);
  }

  return { order, offline, printError };
}

async function trySubmitOnline(id: string, request: SubmitPosOrderRequest, cashierName: string): Promise<LocalOrder | null> {
  try {
    const created = await apiRequest<Order>('PUT', `/api/v1/orders/pos/${id}`, { body: request });
    const order = fromServerOrder(created, cashierName);
    await outboxMarkSynced(id, created.displayCode, order);
    return order;
  } catch (error) {
    if (error instanceof NetworkError) {
      return null;
    }

    if (error instanceof ApiError && (error.status === 401 || error.status >= 500)) {
      return null;
    }

    await outboxDelete(id);
    if (error instanceof ApiError && error.status === 409 && /prices changed/i.test(error.message)) {
      await refreshCatalog().catch(() => undefined);
      throw new CheckoutRejected('Menu prices changed. The menu has been refreshed — check the cart total and try again.', true);
    }

    throw new CheckoutRejected(describeError(error), false);
  }
}

function buildSnapshot(
  id: string,
  createdAt: string,
  input: CheckoutInput,
  subtotal: number,
  cashierId: string,
  cashierName: string,
): LocalOrder {
  return {
    id,
    displayCode: '',
    offlineCode: null,
    createdAt,
    cashierId,
    cashierName,
    customerName: input.customerName.trim() || null,
    orderNotes: input.orderNotes.trim() || null,
    lines: input.lines.map((line, index) => ({
      name: line.name,
      quantity: line.quantity,
      unitBasePrice: line.unitBasePrice,
      modifiers: line.modifiers.map((modifier) => ({ name: modifier.name, extraPrice: modifier.extraPrice })),
      totalLinePrice: lineTotal(line),
      isFreeLoyaltyItem: input.quote?.freeLineIndex === index,
    })),
    subtotal,
    discount: input.quote?.totalDiscount ?? 0,
    netAmountDue: subtotal - (input.quote?.totalDiscount ?? 0),
    discountLabel: input.quote ? discountLabel(input.quote) : null,
    payments: input.payments,
    isCancelled: false,
  };
}

export const toPaymentSplit = (payment: LocalOrderPayment): PaymentSplit => ({
  method: payment.method,
  amount: payment.amount / 100,
  amountTendered: payment.amountTendered === null ? null : payment.amountTendered / 100,
  changeGiven: payment.amountTendered === null ? null : payment.changeGiven / 100,
  referenceNumber: null,
});

async function nextOfflineCode(deviceLetter: string, createdAt: string): Promise<string> {
  const businessDate = businessDateOf(new Date(createdAt));
  const counter = await kvGet<{ businessDate: string; last: number }>(OFFLINE_COUNTER_KEY);
  const next = counter?.businessDate === businessDate ? counter.last + 1 : 1;
  await kvSet(OFFLINE_COUNTER_KEY, { businessDate, last: next });
  return `OFF-${deviceLetter}${String(next).padStart(2, '0')}`;
}
