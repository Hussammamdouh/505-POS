import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { formatEgp, formatMoney, parseMoneyInput, toPiastres } from '@/lib/money';
import { refundOrder, type RefundLine } from '@/lib/orderActions';
import { PAYMENT_LABELS } from '@/lib/printing/documents';
import type { Order } from '@/lib/types';
import { canManage, useApp } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { colors, font, radius, space } from '@/ui/theme';

import { dialogStyles } from './CancelDialog';

interface RefundDialogProps {
  order: Order;
  onClose: () => void;
  onRefunded: (order: Order) => void;
}

export function RefundDialog({ order, onClose, onRefunded }: RefundDialogProps) {
  const session = useApp((state) => state.session);
  const needsManagerPin = !canManage(session);
  const refundable = order.payments
    .map((payment) => {
      const alreadyRefunded = order.refunds
        .filter((refund) => refund.orderPaymentId === payment.id)
        .reduce((sum, refund) => sum + toPiastres(refund.amount), 0);
      return { payment, remaining: toPiastres(payment.amount) - alreadyRefunded };
    })
    .filter((entry) => entry.remaining > 0);

  const canPartial = order.status === 'COMPLETED';
  const [full, setFull] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalRemaining = refundable.reduce((sum, entry) => sum + entry.remaining, 0);

  const confirm = async () => {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }

    let lines: RefundLine[] | null = null;
    if (!full) {
      lines = [];
      for (const entry of refundable) {
        const text = amounts[entry.payment.id]?.trim();
        if (!text) {
          continue;
        }

        const amount = parseMoneyInput(text);
        if (amount === null || amount <= 0 || amount > entry.remaining) {
          setError(`${PAYMENT_LABELS[entry.payment.method]}: enter up to ${formatMoney(entry.remaining)}.`);
          return;
        }

        lines.push({ orderPaymentId: entry.payment.id, amount });
      }

      if (lines.length === 0) {
        setError('Enter the amount to refund on at least one payment.');
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      onRefunded(await refundOrder(order.id, reason.trim(), needsManagerPin ? managerPin : null, lines));
    } catch (refundError) {
      setError(refundError instanceof NetworkError ? 'Refunds need the internet.' : describeError(refundError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <View style={dialogStyles.backdrop}>
        <View style={dialogStyles.dialog}>
          <Text style={dialogStyles.title}>Refund {order.displayCode}</Text>
          <Text style={dialogStyles.meta}>Up to {formatEgp(totalRemaining)} can be refunded. The money goes back by the same method it was paid.</Text>

          {canPartial ? (
            <View style={styles.segment}>
              {[true, false].map((option) => (
                <Pressable
                  key={String(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: full === option }}
                  onPress={() => setFull(option)}
                  style={[styles.segmentOption, full === option && styles.segmentActive]}>
                  <Text style={[styles.segmentText, full === option && styles.segmentTextActive]}>{option ? 'Full refund' : 'Part refund'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {!full
            ? refundable.map((entry) => (
                <Field
                  key={entry.payment.id}
                  label={`${PAYMENT_LABELS[entry.payment.method]} (up to ${formatMoney(entry.remaining)})`}
                  value={amounts[entry.payment.id] ?? ''}
                  onChangeText={(text) => setAmounts((current) => ({ ...current, [entry.payment.id]: text }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              ))
            : null}

          <Field label="Reason" value={reason} onChangeText={setReason} />
          {needsManagerPin ? (
            <Field label="Manager PIN" value={managerPin} onChangeText={setManagerPin} keyboardType="number-pad" secureTextEntry maxLength={6} />
          ) : null}
          {error ? <Banner tone="danger" message={error} /> : null}

          <View style={dialogStyles.actions}>
            <Button label="Back" variant="secondary" onPress={onClose} style={dialogStyles.grow} />
            <Button label={full ? `Refund ${formatMoney(totalRemaining)}` : 'Refund'} variant="danger" onPress={() => void confirm()} busy={busy} style={dialogStyles.grow} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', gap: space.sm },
  segmentOption: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  segmentText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  segmentTextActive: { color: colors.primary },
});
