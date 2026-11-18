import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { formatReceiptTime } from '@/lib/businessDay';
import type { LocalOrderPayment } from '@/lib/localOrder';
import { formatEgp, formatMoney, toPiastres } from '@/lib/money';
import {
  acceptOrder,
  finalizeOrder,
  markPreparing,
  markReady,
  printReceipt,
} from '@/lib/orderActions';
import { METHODS_BY_CHANNEL, PAYMENT_LABELS } from '@/lib/printing/documents';
import type { Order, OrderChannel, OrderStatus } from '@/lib/types';
import { canManage, useApp } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { PaymentSheet } from '@/ui/register/PaymentSheet';
import { colors, font, radius, space } from '@/ui/theme';

import { CancelDialog } from './CancelDialog';
import { RefundDialog } from './RefundDialog';
import { VoidDialog } from './VoidDialog';

export const CHANNEL_LABELS: Record<OrderChannel, string> = { POS: 'In-store', WEB: 'Website', TALABAT: 'Talabat' };

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'New',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const OPEN_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'];
const PAYABLE_STATUSES: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY'];

type Feedback = { tone: 'success' | 'danger'; message: string } | null;
type Dialog = 'pay' | 'cancel' | 'refund' | 'void' | null;

export function ServerOrderPanel({ order, onChanged }: { order: Order; onChanged: (order: Order) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const balance = toPiastres(order.balanceDue);
  // Only website orders go through Preparing and Ready; the rest are accepted and paid.
  const tracksProgress = order.channel === 'WEB';
  const session = useApp((state) => state.session);
  // Baristas can never cancel website orders, not even with a manager PIN.
  const canCancel = OPEN_STATUSES.includes(order.status) && (order.channel !== 'WEB' || canManage(session));
  const refundable = toPiastres(order.amountPaid) - toPiastres(order.amountRefunded);
  const canVoid = canManage(session) && order.status !== 'CANCELLED';

  const run = async (label: string, task: () => Promise<string>) => {
    setBusy(label);
    setFeedback(null);
    try {
      setFeedback({ tone: 'success', message: await task() });
    } catch (error) {
      setFeedback({ tone: 'danger', message: error instanceof NetworkError ? 'This needs the internet.' : describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = (label: string, action: (orderId: string) => Promise<Order>, message: string, printAfter = false) =>
    run(label, async () => {
      const updated = await action(order.id);
      onChanged(updated);
      if (printAfter) {
        try {
          await printReceipt(updated);
        } catch (error) {
          return `${message} Receipt did not print: ${describeError(error)}`;
        }
      }
      return message;
    });

  const pay = async (payments: LocalOrderPayment[]) => {
    setBusy('pay');
    setPayError(null);
    try {
      const updated = await finalizeOrder(order.id, payments);
      onChanged(updated);
      setDialog(null);
      // Website and Talabat orders already printed their one receipt when accepted, so paying doesn't print again.
      if (updated.channel === 'POS') {
        try {
          await printReceipt(updated);
          setFeedback({ tone: 'success', message: 'Payment saved and receipt printed.' });
        } catch (error) {
          setFeedback({ tone: 'danger', message: `Payment saved, but the receipt did not print: ${describeError(error)}` });
        }
      } else {
        setFeedback({ tone: 'success', message: 'Payment saved. Use Reprint receipt if the customer wants a paid copy.' });
      }
    } catch (error) {
      setPayError(error instanceof NetworkError ? 'Taking payment on this order needs the internet.' : describeError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.code}>{order.displayCode}</Text>
        <Text style={styles.badge}>
          {CHANNEL_LABELS[order.channel]} · {STATUS_LABELS[order.status]}
        </Text>
      </View>
      <Text style={styles.meta}>
        {formatReceiptTime(order.createdAt)}
        {order.offlineCode ? ` · offline ref ${order.offlineCode}` : ''}
      </Text>
      {order.customerName || order.customerPhone ? (
        <Text style={styles.meta}>{[order.customerName, order.customerPhone].filter(Boolean).join(' · ')}</Text>
      ) : null}
      {order.cancellationReason ? <Banner tone="danger" message={`Cancelled: ${order.cancellationReason}`} /> : null}

      <View style={styles.lines}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.line}>
            <Text style={styles.lineName}>
              {item.quantity} × {item.itemName}
              {item.isFreeLoyaltyItem ? ' (reward)' : ''}
              {item.modifiers.length > 0 ? `\n${item.modifiers.map((modifier) => modifier.modifierName).join(', ')}` : ''}
            </Text>
            <Text style={styles.lineAmount}>{formatMoney(toPiastres(item.totalLinePrice))}</Text>
          </View>
        ))}
      </View>
      {order.orderNotes ? <Banner tone="info" message={`Note: ${order.orderNotes}`} /> : null}

      <View style={styles.totals}>
        <Row label="Subtotal" value={formatEgp(toPiastres(order.subtotalAmount))} />
        {order.discountAmount > 0 ? (
          <Row
            label={`Discount${order.promoCodeUsed || order.loyaltyRewardApplied ? ` (${[order.promoCodeUsed, order.loyaltyRewardApplied].filter(Boolean).join(' + ')})` : ''}`}
            value={`-${formatEgp(toPiastres(order.discountAmount))}`}
          />
        ) : null}
        <Row label="Net to collect" value={formatEgp(toPiastres(order.netAmountDue))} bold />
        {order.payments.map((payment) => (
          <Row key={payment.id} label={PAYMENT_LABELS[payment.method]} value={formatEgp(toPiastres(payment.amount))} muted />
        ))}
        {order.refunds.map((refund) => (
          <Row key={refund.id} label={`Refund (${PAYMENT_LABELS[refund.method]})`} value={`-${formatEgp(toPiastres(refund.amount))}`} muted />
        ))}
        {balance > 0 && order.status !== 'CANCELLED' ? <Row label="Balance due" value={formatEgp(balance)} bold warn /> : null}
      </View>

      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      <View style={styles.actions}>
        {order.status === 'PENDING' ? (
          <Button label="Accept & print receipt" onPress={() => void changeStatus('accept', acceptOrder, 'Order accepted.', true)} busy={busy === 'accept'} large />
        ) : null}
        {order.status === 'ACCEPTED' && tracksProgress ? (
          <Button label="Start preparing" variant="secondary" onPress={() => void changeStatus('preparing', markPreparing, 'Marked as preparing.')} busy={busy === 'preparing'} />
        ) : null}
        {tracksProgress && (order.status === 'ACCEPTED' || order.status === 'PREPARING') ? (
          <Button label="Mark ready" variant="secondary" onPress={() => void changeStatus('ready', markReady, 'Marked as ready.')} busy={busy === 'ready'} />
        ) : null}
        {balance > 0 && PAYABLE_STATUSES.includes(order.status) ? (
          <Button
            label={`Take payment · ${formatMoney(balance)}`}
            onPress={() => {
              setPayError(null);
              setDialog('pay');
            }}
            large
          />
        ) : null}
        <Button label="Reprint receipt" variant="secondary" onPress={() => void run('receipt', async () => (await printReceipt(order, true), 'Receipt reprinted.'))} busy={busy === 'receipt'} />
        {refundable > 0 ? <Button label="Refund" variant="secondary" onPress={() => setDialog('refund')} /> : null}
        {canCancel ? <Button label="Cancel order" variant="danger" onPress={() => setDialog('cancel')} /> : null}
        {canVoid ? <Button label="Void" variant="danger" onPress={() => setDialog('void')} /> : null}
      </View>

      {dialog === 'pay' ? (
        <PaymentSheet
          methods={METHODS_BY_CHANNEL[order.channel]}
          amountDue={balance}
          busy={busy === 'pay'}
          error={payError}
          onConfirm={(payments) => void pay(payments)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'cancel' ? (
        <CancelDialog
          orderId={order.id}
          displayCode={order.displayCode}
          onClose={() => setDialog(null)}
          onCancelled={(updated) => {
            onChanged(updated);
            setDialog(null);
            setFeedback({ tone: 'success', message: `Order ${updated.displayCode} cancelled.` });
          }}
        />
      ) : null}
      {dialog === 'void' ? (
        <VoidDialog
          order={order}
          onClose={() => setDialog(null)}
          onVoided={(updated) => {
            onChanged(updated);
            setDialog(null);
            setFeedback({
              tone: 'success',
              message: refundable > 0
                ? `Order ${updated.displayCode} voided. Give ${formatEgp(refundable)} back by the same method.`
                : `Order ${updated.displayCode} voided.`,
            });
          }}
        />
      ) : null}
      {dialog === 'refund' ? (
        <RefundDialog
          order={order}
          onClose={() => setDialog(null)}
          onRefunded={(updated) => {
            onChanged(updated);
            setDialog(null);
            setFeedback({ tone: 'success', message: 'Refund recorded. Give the money back by the same method.' });
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, bold, muted, warn }: { label: string; value: string; bold?: boolean; muted?: boolean; warn?: boolean }) {
  const color = warn ? colors.warning : muted ? colors.textMuted : colors.text;
  return (
    <View style={styles.row}>
      <Text style={[styles.rowText, { color }, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowText, { color }, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: space.xl, gap: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
  code: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  badge: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.selected,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  meta: { fontSize: font.body, color: colors.textMuted },
  lines: { gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { flex: 1, fontSize: font.body, color: colors.text },
  lineAmount: { fontSize: font.body, color: colors.text },
  totals: { gap: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowText: { fontSize: font.body },
  bold: { fontWeight: '700', fontSize: font.large },
  actions: { gap: space.sm },
});
