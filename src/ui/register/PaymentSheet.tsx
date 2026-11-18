import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LocalOrderPayment } from '@/lib/localOrder';
import { formatEgp, formatMoney, parseMoneyInput, type Piastres } from '@/lib/money';
import { isDrawerCash, isTalabat, METHODS_BY_CHANNEL, PAYMENT_LABELS } from '@/lib/printing/documents';
import type { PaymentMethod } from '@/lib/types';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { colors, font, radius, space } from '@/ui/theme';

const CASH_NOTES = [5000, 10000, 20000, 50000];

interface PaymentSheetProps {
  methods?: PaymentMethod[];
  amountDue: Piastres;
  busy: boolean;
  error: string | null;
  onConfirm: (payments: LocalOrderPayment[]) => void;
  onClose: () => void;
}

export function PaymentSheet({ methods = METHODS_BY_CHANNEL.POS, amountDue, busy, error, onConfirm, onClose }: PaymentSheetProps) {
  const [payments, setPayments] = useState<LocalOrderPayment[]>([]);
  const [method, setMethod] = useState<PaymentMethod>(methods[0]);
  const takesCash = isDrawerCash(method);
  const [amountText, setAmountText] = useState(() => formatMoney(amountDue));
  const [tenderedText, setTenderedText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const paidSoFar = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = amountDue - paidSoFar;

  const currentEntry = (): LocalOrderPayment | null => {
    const amount = parseMoneyInput(amountText);
    if (amount === null || amount <= 0) {
      setLocalError('Enter a valid amount.');
      return null;
    }

    if (payments.some((payment) => isTalabat(payment.method) !== isTalabat(method))) {
      setLocalError("A Talabat order is paid in full through Talabat. Don't mix Talabat with other payment methods.");
      return null;
    }

    if (amount > remaining) {
      setLocalError(`Amount is more than the ${formatEgp(remaining)} left to pay. Put extra cash in "Cash received".`);
      return null;
    }

    if (!takesCash || tenderedText.trim() === '') {
      return { method, amount, amountTendered: null, changeGiven: 0 };
    }

    const tendered = parseMoneyInput(tenderedText);
    if (tendered === null || tendered < amount) {
      setLocalError('Cash received must be at least the amount.');
      return null;
    }

    return { method, amount, amountTendered: tendered, changeGiven: tendered - amount };
  };

  const addSplit = () => {
    const entry = currentEntry();
    if (!entry) {
      return;
    }

    const next = [...payments, entry];
    setPayments(next);
    setLocalError(null);
    setTenderedText('');
    setAmountText(formatMoney(amountDue - next.reduce((sum, payment) => sum + payment.amount, 0)));
  };

  const complete = () => {
    const entry = remaining > 0 ? currentEntry() : null;
    if (remaining > 0 && !entry) {
      return;
    }

    const all = entry ? [...payments, entry] : payments;
    if (all.reduce((sum, payment) => sum + payment.amount, 0) !== amountDue) {
      setLocalError('The payments must add up to the full total. Use "Add split" for part-payments.');
      return;
    }

    onConfirm(all);
  };

  const tendered = parseMoneyInput(tenderedText);
  const amount = parseMoneyInput(amountText);
  const change = takesCash && tendered !== null && amount !== null && tendered >= amount ? tendered - amount : null;

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Take payment</Text>
            <Text style={styles.total}>{formatEgp(amountDue)}</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.methods}>
              {methods.map((candidate) => (
                <Pressable
                  key={candidate}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: method === candidate }}
                  onPress={() => {
                    setMethod(candidate);
                    setLocalError(null);
                  }}
                  style={[styles.method, method === candidate && styles.methodActive]}>
                  <Text style={[styles.methodText, method === candidate && styles.methodTextActive]}>{PAYMENT_LABELS[candidate]}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.entry}>
              <Field label="Amount" value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" selectTextOnFocus />
              {takesCash ? (
                <>
                  <Field label="Cash received (optional)" value={tenderedText} onChangeText={setTenderedText} keyboardType="decimal-pad" />
                  <View style={styles.notes}>
                    {CASH_NOTES.filter((note) => amount === null || note >= amount).map((note) => (
                      <Button key={note} label={formatMoney(note)} variant="secondary" onPress={() => setTenderedText(formatMoney(note))} style={styles.note} />
                    ))}
                  </View>
                  {change !== null ? <Text style={styles.change}>Change: {formatEgp(change)}</Text> : null}
                </>
              ) : null}
            </View>
          </View>

          {payments.length > 0 ? (
            <View style={styles.splits}>
              {payments.map((payment, index) => (
                <Text key={index} style={styles.split}>
                  {PAYMENT_LABELS[payment.method]} · {formatEgp(payment.amount)}
                </Text>
              ))}
              <Text style={styles.remaining}>Left to pay: {formatEgp(remaining)}</Text>
            </View>
          ) : null}

          {localError || error ? <Banner tone="danger" message={localError ?? error ?? ''} /> : null}

          <View style={styles.footer}>
            <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
            <Button label="Add split" variant="secondary" onPress={addSplit} disabled={busy || remaining <= 0} />
            <Button label="Complete order" onPress={complete} busy={busy} style={styles.complete} large />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  sheet: { width: '100%', maxWidth: 760, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  total: { fontSize: font.hero, fontWeight: '700', color: colors.primary },
  body: { flexDirection: 'row', gap: space.xl },
  methods: { width: 220, gap: space.sm },
  method: {
    minHeight: 60,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  methodActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  methodText: { fontSize: font.large, fontWeight: '600', color: colors.text },
  methodTextActive: { color: colors.primary },
  entry: { flex: 1, gap: space.md },
  notes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  note: { minWidth: 96 },
  change: { fontSize: font.title, fontWeight: '700', color: colors.success },
  splits: { gap: space.xs, padding: space.md, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm },
  split: { fontSize: font.body, color: colors.text },
  remaining: { fontSize: font.body, fontWeight: '700', color: colors.text },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  complete: { flex: 1 },
});
