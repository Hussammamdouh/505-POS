import { toPiastres, type Piastres } from './money';
import type { Order, OrderChannel, PaymentMethod } from './types';

export interface LocalOrderLine {
  name: string;
  quantity: number;
  unitBasePrice: Piastres;
  modifiers: { name: string; extraPrice: Piastres }[];
  totalLinePrice: Piastres;
  isFreeLoyaltyItem: boolean;
}

export interface LocalOrderPayment {
  method: PaymentMethod;
  amount: Piastres;
  amountTendered: Piastres | null;
  changeGiven: Piastres;
}

export interface LocalOrder {
  id: string;
  displayCode: string;
  offlineCode: string | null;
  createdAt: string;
  cashierId: string;
  cashierName: string;
  customerName: string | null;
  orderNotes: string | null;
  lines: LocalOrderLine[];
  subtotal: Piastres;
  discount: Piastres;
  netAmountDue: Piastres;
  payments: LocalOrderPayment[];
  isCancelled: boolean;
  // Set only for orders that came from the server; snapshots taken on the iPad are in-store orders.
  channel?: OrderChannel;
  discountLabel?: string | null;
  refunds?: { method: PaymentMethod; amount: Piastres }[];
}

export const amountPaid = (order: LocalOrder): Piastres =>
  order.payments.reduce((sum, payment) => sum + payment.amount, 0);

export const balanceDue = (order: LocalOrder): Piastres => order.netAmountDue - amountPaid(order);

export function fromServerOrder(order: Order, cashierName: string): LocalOrder {
  return {
    id: order.id,
    displayCode: order.displayCode,
    offlineCode: order.offlineCode,
    createdAt: order.createdAt,
    cashierId: order.cashierId ?? '',
    cashierName,
    customerName: order.customerName,
    orderNotes: order.orderNotes,
    lines: order.items.map((item) => ({
      name: item.itemName,
      quantity: item.quantity,
      unitBasePrice: toPiastres(item.unitBasePrice),
      modifiers: item.modifiers.map((modifier) => ({ name: modifier.modifierName, extraPrice: toPiastres(modifier.extraPrice) })),
      totalLinePrice: toPiastres(item.totalLinePrice),
      isFreeLoyaltyItem: item.isFreeLoyaltyItem,
    })),
    subtotal: toPiastres(order.subtotalAmount),
    discount: toPiastres(order.discountAmount),
    netAmountDue: toPiastres(order.netAmountDue),
    payments: order.payments.map((payment) => ({
      method: payment.method,
      amount: toPiastres(payment.amount),
      amountTendered: payment.amountTendered === null ? null : toPiastres(payment.amountTendered),
      changeGiven: toPiastres(payment.changeGiven),
    })),
    isCancelled: order.status === 'CANCELLED',
    channel: order.channel,
    discountLabel: [order.offerName, order.promoCodeUsed, order.loyaltyRewardApplied].filter((label) => label).join(' + ') || null,
    refunds: order.refunds.map((refund) => ({ method: refund.method, amount: toPiastres(refund.amount) })),
  };
}
