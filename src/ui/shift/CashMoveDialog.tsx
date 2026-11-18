import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiRequest, describeError, NetworkError } from '@/lib/api';
import { formatEgp, parseMoneyInput, toPiastres } from '@/lib/money';
import type { CashMovementType, ExpenseCategory } from '@/lib/types';
import { ChipSelect } from '@/ui/admin/AdminKit';
import { EXPENSE_CATEGORY_LABELS } from '@/ui/admin/labels';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { dialogStyles } from '@/ui/orders/CancelDialog';

export const MOVEMENT_LABELS: Record<CashMovementType, string> = { CASH_DROP: 'Cash drop', PETTY_PAYOUT: 'Payout', STAFF_LOAN: 'Staff loan' };

/** Staff loans have their own dialog (StaffLoanDialog), since they say who took the money. */
export type DrawerMoveType = Exclude<CashMovementType, 'STAFF_LOAN'>;

const MOVEMENT_HELP: Record<DrawerMoveType, string> = {
  PETTY_PAYOUT: 'Cash taken from the drawer to pay for something. It is recorded as an expense.',
  CASH_DROP: 'Cash taken out of the drawer to keep it safe (not spent).',
};

// Rent, salaries and other bills are paid outside the drawer, so they are not offered here.
const PAYOUT_CATEGORIES: ExpenseCategory[] = [
  'PACKAGING_CONSUMABLES',
  'MAINTENANCE_REPAIRS',
  'STAFF_BONUS_OVERTIME',
  'MARKETING_ADS',
  'GOVERNMENT_PERMITS',
  'MISCELLANEOUS',
];

export function CashMoveDialog({ type, needsManagerPin, expectedCash, onClose, onRecorded }: {
  type: DrawerMoveType;
  needsManagerPin: boolean;
  /** What should be in the drawer, when the signed-in staff may see it. */
  expectedCash: number | null;
  onClose: () => void;
  onRecorded: (message: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('MISCELLANEOUS');
  const [managerPin, setManagerPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const record = async () => {
    const value = parseMoneyInput(amount);
    if (value === null || value <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }

    if (needsManagerPin && !managerPin) {
      setError('A manager needs to enter their PIN.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest('POST', '/api/v1/shifts/cash-movement', {
        body: {
          movementType: type,
          amount: value / 100,
          reason: reason.trim(),
          managerPin: needsManagerPin ? managerPin : null,
          expenseCategory: type === 'PETTY_PAYOUT' ? category : null,
          recurringExpenseId: null,
        },
      });
      onRecorded(`${MOVEMENT_LABELS[type]} of ${formatEgp(value)} recorded.`);
    } catch (recordError) {
      setError(recordError instanceof NetworkError ? 'This needs the internet. Try again when back online.' : describeError(recordError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <View style={dialogStyles.backdrop}>
        <View style={[dialogStyles.dialog, styles.dialog]}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={dialogStyles.title}>{MOVEMENT_LABELS[type]}</Text>
            <Text style={dialogStyles.meta}>
              {MOVEMENT_HELP[type]}
              {expectedCash !== null ? ` The drawer should hold ${formatEgp(toPiastres(expectedCash))}.` : ''}
            </Text>
            <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus />
            <Field label={type === 'PETTY_PAYOUT' ? 'What was it for?' : 'Reason'} value={reason} onChangeText={setReason} />
            {type === 'PETTY_PAYOUT' ? (
              <ChipSelect
                label="Expense type"
                options={PAYOUT_CATEGORIES.map((value) => ({ value, label: EXPENSE_CATEGORY_LABELS[value] }))}
                selected={[category]}
                onToggle={setCategory}
              />
            ) : null}
            {needsManagerPin ? (
              <Field label="Manager PIN" value={managerPin} onChangeText={setManagerPin} keyboardType="number-pad" secureTextEntry maxLength={6} />
            ) : null}
            {error ? <Banner tone="danger" message={error} /> : null}
          </ScrollView>
          <View style={dialogStyles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={dialogStyles.grow} />
            <Button label={`Record ${MOVEMENT_LABELS[type].toLowerCase()}`} onPress={() => void record()} busy={busy} style={dialogStyles.grow} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxHeight: '90%' },
  body: { gap: 12 },
});
