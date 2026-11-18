import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiRequest, describeError, NetworkError } from '@/lib/api';
import { cachedStaffTiles, fetchStaffTiles } from '@/lib/auth';
import { formatEgp, parseMoneyInput, toPiastres } from '@/lib/money';
import type { StaffLoginTile } from '@/lib/types';
import { ChipSelect } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { dialogStyles } from '@/ui/orders/CancelDialog';

/**
 * A staff member borrows cash from the drawer. Anyone signed in can record it (no manager PIN, owner's choice);
 * the server always stores who took it and who recorded it. It comes off that month's salary.
 */
export function StaffLoanDialog({ expectedCash, onClose, onRecorded }: {
  /** What should be in the drawer, when the signed-in staff may see it. */
  expectedCash: number | null;
  onClose: () => void;
  onRecorded: (message: string) => void;
}) {
  const [staff, setStaff] = useState<StaffLoginTile[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchStaffTiles()
      .catch(() => cachedStaffTiles())
      .then((tiles) => active && setStaff([...tiles].sort((a, b) => a.fullName.localeCompare(b.fullName))));
    return () => {
      active = false;
    };
  }, []);

  const record = async () => {
    if (!staffId) {
      setError('Choose who is taking the loan.');
      return;
    }

    const value = parseMoneyInput(amount);
    if (value === null || value <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest('POST', '/api/v1/shifts/staff-loan', {
        body: { staffId, amount: value / 100, note: note.trim() || null },
      });
      const name = staff.find((member) => member.id === staffId)?.fullName ?? 'Staff member';
      onRecorded(`Loan of ${formatEgp(value)} to ${name} recorded. It comes off their salary this month.`);
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
            <Text style={dialogStyles.title}>Staff loan</Text>
            <Text style={dialogStyles.meta}>
              Cash a staff member takes from the drawer. It is deducted from their salary this month.
              {expectedCash !== null ? ` The drawer should hold ${formatEgp(toPiastres(expectedCash))}.` : ''}
            </Text>
            {staff.length === 0 ? <Text style={dialogStyles.meta}>Loading staff…</Text> : null}
            <ChipSelect
              label="Who is taking it?"
              options={staff.map((member) => ({ value: member.id, label: member.fullName }))}
              selected={staffId ? [staffId] : []}
              onToggle={setStaffId}
            />
            <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={400} />
            {error ? <Banner tone="danger" message={error} /> : null}
          </ScrollView>
          <View style={dialogStyles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={dialogStyles.grow} />
            <Button label="Record loan" onPress={() => void record()} busy={busy} style={dialogStyles.grow} />
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
