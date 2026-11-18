import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BIG_UNIT, formatQuantity, recordMovement, UNIT_LABELS, type RecordMovementRequest } from '@/lib/inventory';
import { parseMoneyInput, toEgp } from '@/lib/money';
import type { ExpensePaymentSource, InventoryItem, InventoryUnit } from '@/lib/types';

import { ChipSelect, formStyles, FormRow, Panel } from '../admin/AdminKit';
import { PAYMENT_SOURCE_LABELS } from '../admin/labels';
import { Button } from '../Button';
import { Field } from '../Field';
import { colors, font, space } from '../theme';

export type MovementKind = RecordMovementRequest['movementType'];

const TITLES: Record<MovementKind, string> = {
  PURCHASE_RECEIPT: 'Receive a delivery',
  WASTE_SPOILAGE: 'Log waste',
  AUDIT_ADJUSTMENT: 'Stock count',
};

const WASTE_REASONS = ['Spilled', 'Expired', 'Dial-in', 'Made wrong', 'Damaged'];
const SUPPLIER_SOURCES: (ExpensePaymentSource | 'UNPAID')[] = ['OWNER_CASH', 'BANK_TRANSFER', 'COMPANY_CARD', 'UNPAID'];

function parseQuantity(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return /^\d+(\.\d{1,3})?$/.test(normalized) ? Number(normalized) : null;
}

export function MovementForm({ item, kind, onDone, onError, onCancel }: {
  item: InventoryItem;
  kind: MovementKind;
  onDone: (updated: InventoryItem, message: string) => void;
  onError: (error: unknown) => void;
  onCancel: () => void;
}) {
  const big = BIG_UNIT[item.unitOfMeasure];
  const [unit, setUnit] = useState<InventoryUnit>(kind === 'PURCHASE_RECEIPT' && big ? big : item.unitOfMeasure);
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [paidWith, setPaidWith] = useState<ExpensePaymentSource | 'UNPAID'>('OWNER_CASH');
  const [supplier, setSupplier] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const amount = parseQuantity(quantity);
  const baseAmount = amount === null ? null : unit !== item.unitOfMeasure ? amount * 1000 : amount;
  const cost = totalCost.trim() ? parseMoneyInput(totalCost) : null;
  const unitPrice = baseAmount && cost !== null && baseAmount > 0 ? toEgp(cost) / baseAmount : null;

  const save = async () => {
    setBusy(true);
    try {
      if (amount === null) {
        throw new Error('Enter a quantity like 2 or 2.5.');
      }

      if (totalCost.trim() && cost === null) {
        throw new Error('The cost must be a number like 450 or 450.50.');
      }

      const updated = await recordMovement({
        inventoryItemId: item.id,
        movementType: kind,
        quantity: amount,
        entryUnit: unit,
        totalCost: kind === 'PURCHASE_RECEIPT' && cost !== null ? toEgp(cost) : null,
        paymentSource: kind === 'PURCHASE_RECEIPT' && cost !== null && paidWith !== 'UNPAID' ? paidWith : null,
        supplierName: kind === 'PURCHASE_RECEIPT' ? supplier.trim() || null : null,
        reasonNotes: reason.trim() || null,
      });
      const what = `${trimNumber(amount)} ${UNIT_LABELS[unit]} of ${item.name}`;
      onDone(
        updated,
        kind === 'PURCHASE_RECEIPT'
          ? `Received ${what}. Stock is now ${formatQuantity(updated.currentStock, updated.unitOfMeasure)}.`
          : kind === 'WASTE_SPOILAGE'
            ? `Logged ${what} as waste.`
            : `Stock of ${item.name} set to ${formatQuantity(updated.currentStock, updated.unitOfMeasure)}.`,
      );
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={`${TITLES[kind]}: ${item.name}`} scroll={false}>
      <Text style={styles.hint}>In stock now: {formatQuantity(item.currentStock, item.unitOfMeasure)}</Text>
      <FormRow>
        <View style={formStyles.grow}>
          <Field
            label={kind === 'AUDIT_ADJUSTMENT' ? 'Counted on the shelf' : kind === 'WASTE_SPOILAGE' ? 'Amount wasted' : 'Amount received'}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            autoFocus
          />
        </View>
        {big ? (
          <View style={styles.units}>
            <ChipSelect
              label="Unit"
              options={[item.unitOfMeasure, big].map((value) => ({ value, label: UNIT_LABELS[value] }))}
              selected={[unit]}
              onToggle={setUnit}
            />
          </View>
        ) : null}
      </FormRow>

      {kind === 'PURCHASE_RECEIPT' ? (
        <>
          <FormRow>
            <View style={formStyles.grow}>
              <Field
                label="Total cost (EGP, optional)"
                hint={unitPrice !== null ? `${unitPrice.toFixed(4)} EGP per ${UNIT_LABELS[item.unitOfMeasure]}` : 'Updates the average cost and recipe costs.'}
                value={totalCost}
                onChangeText={setTotalCost}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={formStyles.grow}>
              <Field label="Supplier (optional)" value={supplier} onChangeText={setSupplier} />
            </View>
          </FormRow>
          {totalCost.trim() ? (
            <ChipSelect
              label="Paid with (shows in Cash flow)"
              options={SUPPLIER_SOURCES.map((value) => ({ value, label: value === 'UNPAID' ? 'Not paid yet' : PAYMENT_SOURCE_LABELS[value] }))}
              selected={[paidWith]}
              onToggle={setPaidWith}
            />
          ) : null}
        </>
      ) : null}

      {kind === 'WASTE_SPOILAGE' ? (
        <ChipSelect label="Why?" options={WASTE_REASONS.map((value) => ({ value, label: value }))} selected={[reason]} onToggle={setReason} />
      ) : null}
      <Field
        label={kind === 'WASTE_SPOILAGE' ? 'Reason (pick one above or type)' : 'Notes (optional)'}
        value={reason}
        onChangeText={setReason}
      />

      <View style={formStyles.actions}>
        <Button label={TITLES[kind]} onPress={() => void save()} busy={busy} large style={formStyles.grow} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} large />
      </View>
    </Panel>
  );
}

const trimNumber = (value: number) => String(Math.round(value * 1000) / 1000);

const styles = StyleSheet.create({
  hint: { fontSize: font.body, color: colors.textMuted },
  units: { justifyContent: 'flex-end', paddingBottom: space.xs },
});
