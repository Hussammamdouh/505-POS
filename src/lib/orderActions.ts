import { useApp } from '@/store/app';

import { apiRequest } from './api';
import { toPaymentSplit } from './checkout';
import { fromServerOrder, type LocalOrderPayment } from './localOrder';
import { printOrderReceipt, printShiftReportData } from './printing/printer';
import type { Order, OrderChannel, OrderSearchResult, PrintJob, ShiftReport } from './types';

export const fetchOrder = (orderId: string) => apiRequest<Order>('GET', `/api/v1/orders/${orderId}`);

export const fetchOpenOrders = () => apiRequest<Order[]>('GET', '/api/v1/orders/open');

export const acceptOrder = (orderId: string) => apiRequest<Order>('PATCH', `/api/v1/orders/${orderId}/accept`);

export const markPreparing = (orderId: string) => apiRequest<Order>('PATCH', `/api/v1/orders/${orderId}/preparing`);

export const markReady = (orderId: string) => apiRequest<Order>('PATCH', `/api/v1/orders/${orderId}/ready`);

export const finalizeOrder = (orderId: string, payments: LocalOrderPayment[]) =>
  apiRequest<Order>('POST', `/api/v1/orders/${orderId}/finalize`, { body: { payments: payments.map(toPaymentSplit) } });

export const cancelOrder = (orderId: string, reason: string, managerPin: string | null) =>
  apiRequest<Order>('PATCH', `/api/v1/orders/${orderId}/cancel`, { body: { reason, managerPin } });

export const voidOrder = (orderId: string, reason: string) =>
  apiRequest<Order>('POST', `/api/v1/orders/${orderId}/void`, { body: { reason } });

export interface RefundLine {
  orderPaymentId: string;
  amount: number;
}

export const refundOrder = (orderId: string, reason: string, managerPin: string | null, lines: RefundLine[] | null) =>
  apiRequest<Order>('POST', `/api/v1/orders/${orderId}/refund`, {
    body: { reason, managerPin, payments: lines?.map((line) => ({ orderPaymentId: line.orderPaymentId, amount: line.amount / 100 })) ?? null },
  });

export function searchOrders(query: { from: string; to: string; code?: string; phone?: string; channel?: OrderChannel; offset?: number }) {
  const params = new URLSearchParams({ from: query.from, to: query.to, limit: '50', offset: String(query.offset ?? 0) });
  if (query.code) {
    params.set('code', query.code);
  }

  if (query.phone) {
    params.set('phone', query.phone);
  }

  if (query.channel) {
    params.set('channel', query.channel);
  }

  return apiRequest<OrderSearchResult>('GET', `/api/v1/orders?${params.toString()}`);
}

function requireSettings() {
  const settings = useApp.getState().settings;
  if (!settings) {
    throw new Error('Device settings are missing.');
  }

  return settings;
}

// Receipts are drawn on the iPad (same design and logos as in-store orders), not by the server.
export async function printReceipt(order: Order, reprint = false) {
  const settings = requireSettings();
  if (reprint) {
    // The server records receipt reprints in the security audit log; its own print data is not used.
    await apiRequest<PrintJob>('POST', `/api/v1/orders/${order.id}/print/receipt?reprint=true`);
  }

  // Website and Talabat orders have no cashier until paid, so they show who is on shift handling them.
  const session = useApp.getState().session;
  const cashierName = session && (order.cashierId === null || order.cashierId === session.staffId) ? session.fullName : '';
  await printOrderReceipt(settings, fromServerOrder(order, cashierName), reprint);
}

export async function printShiftReport(shiftId: string) {
  const settings = requireSettings();
  await printShiftReportData(settings, await apiRequest<ShiftReport>('GET', `/api/v1/shifts/${shiftId}/report`));
}
