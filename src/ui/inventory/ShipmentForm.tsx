import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { BIG_UNIT, formatQuantity, loadInventory, receiveShipment, UNIT_LABELS } from '@/lib/inventory';
import { formatEgp, parseMoneyInput, toEgp } from '@/lib/money';
import { newId } from '@/lib/ids';
import type { ExpensePaymentSource, InventoryItem, InventoryUnit } from '@/lib/types';

import { ChipSelect, EmptyState, Panel } from '../admin/AdminKit';
import { PAYMENT_SOURCE_LABELS } from '../admin/labels';
import { Banner } from '../Banner';
import { Button } from '../Button';
import { Field } from '../Field';
import { colors, font, radius, space } from '../theme';

type PaidWith = ExpensePaymentSource | 'UNPAID';
type Feedback = { tone: 'success' | 'danger'; message: string } | null;

interface Line {
  key: string;
  /** Null for an ingredient that isn't in the system yet; it is created when the delivery is saved. */
  item: InventoryItem | null;
  newName: string;
  newUnit: InventoryUnit;
  entryUnit: InventoryUnit;
  quantity: string;
  cost: string;
}

const PAID_WITH: PaidWith[] = ['OWNER_CASH', 'BANK_TRANSFER', 'COMPANY_CARD', 'UNPAID'];
const NEW_UNITS: { value: InventoryUnit; label: string }[] = [
  { value: 'G', label: 'Weight (g / kg)' },
  { value: 'ML', label: 'Liquid (ml / L)' },
  { value: 'UNIT', label: 'Pieces' },
];
const MAX_MATCHES = 12;

const errorText = (error: unknown) => (error instanceof NetworkError ? 'Receiving a delivery needs the internet.' : describeError(error));

function parseQuantity(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return /^\d+(\.\d{1,3})?$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}

const baseUnitOf = (line: Line) => line.item?.unitOfMeasure ?? line.newUnit;
const lineName = (line: Line) => line.item?.name ?? line.newName;

/**
 * Receive a whole delivery in one go: search and tap each ingredient (or type a name that isn't in the system to
 * add it), enter how much came, optionally what it cost, and save once. Open to every staff member.
 */
export function ShipmentForm({ onReceived }: { onReceived?: (items: InventoryItem[]) => void }) {
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [supplier, setSupplier] = useState('');
  const [paidWith, setPaidWith] = useState<PaidWith>('OWNER_CASH');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let active = true;
    loadInventory()
      .then((loaded) => active && setInventory(loaded))
      .catch((error) => active && setFeedback({ tone: 'danger', message: errorText(error) }));
    return () => {
      active = false;
    };
  }, []);

  const needle = search.trim().toLowerCase();
  const onDelivery = useMemo(() => new Set(lines.map((line) => line.item?.id).filter(Boolean)), [lines]);
  const active = useMemo(
    () => (inventory ?? []).filter((item) => item.isActive).sort((a, b) => Number(b.isLow) - Number(a.isLow) || a.name.localeCompare(b.name)),
    [inventory],
  );
  const matches = active.filter((item) => !needle || item.name.toLowerCase().includes(needle) || item.sku?.toLowerCase() === needle).slice(0, MAX_MATCHES);
  const exactMatch =
    (inventory ?? []).some((item) => item.name.toLowerCase() === needle) ||
    lines.some((line) => !line.item && line.newName.trim().toLowerCase() === needle);

  const addExisting = (item: InventoryItem) => {
    setSearch('');
    setFeedback(null);
    if (onDelivery.has(item.id)) {
      return;
    }

    const big = BIG_UNIT[item.unitOfMeasure];
    setLines((current) => [
      ...current,
      { key: newId(), item, newName: '', newUnit: item.unitOfMeasure, entryUnit: big ?? item.unitOfMeasure, quantity: '', cost: '' },
    ]);
  };

  const addNew = () => {
    const name = search.trim().replace(/\s+/g, ' ');
    if (!name) {
      return;
    }

    setSearch('');
    setFeedback(null);
    setLines((current) => [...current, { key: newId(), item: null, newName: name, newUnit: 'UNIT', entryUnit: 'UNIT', quantity: '', cost: '' }]);
  };

  const update = (key: string, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const remove = (key: string) => setLines((current) => current.filter((line) => line.key !== key));

  const costs = lines.map((line) => (line.cost.trim() ? parseMoneyInput(line.cost) : null));
  const totalCost = costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
  const anyCost = lines.some((line) => line.cost.trim());

  const save = async () => {
    setFeedback(null);
    if (lines.length === 0) {
      setFeedback({ tone: 'danger', message: 'Add the items that came in first.' });
      return;
    }

    const problem = lines.find((line) => parseQuantity(line.quantity) === null);
    if (problem) {
      setFeedback({ tone: 'danger', message: `Enter how much ${lineName(problem)} came in, like 2 or 2.5.` });
      return;
    }

    const badCost = lines.find((line, index) => line.cost.trim() && costs[index] === null);
    if (badCost) {
      setFeedback({ tone: 'danger', message: `The cost of ${lineName(badCost)} must be a number like 450 or 450.50.` });
      return;
    }

    setBusy(true);
    try {
      const result = await receiveShipment({
        supplierName: supplier.trim() || null,
        paymentSource: anyCost && paidWith !== 'UNPAID' ? paidWith : null,
        notes: notes.trim() || null,
        lines: lines.map((line, index) => ({
          inventoryItemId: line.item?.id ?? null,
          newItem: line.item ? null : { name: line.newName.trim(), unitOfMeasure: line.newUnit, recipeSection: null },
          quantity: parseQuantity(line.quantity)!,
          entryUnit: line.entryUnit,
          totalCost: costs[index] !== null ? toEgp(costs[index]!) : null,
        })),
      });

      setInventory((current) => {
        const byId = new Map((current ?? []).map((item) => [item.id, item]));
        result.items.forEach((item) => byId.set(item.id, item));
        return [...byId.values()];
      });
      onReceived?.(result.items);
      setLines([]);
      setNotes('');
      const created = result.createdItems.length > 0 ? ` New in the system: ${result.createdItems.join(', ')}.` : '';
      const money = result.totalCost > 0 ? ` Total ${formatEgp(Math.round(result.totalCost * 100))}.` : '';
      setFeedback({ tone: 'success', message: `Delivery received: ${result.lines} item${result.lines > 1 ? 's' : ''}.${money}${created}` });
    } catch (error) {
      setFeedback({ tone: 'danger', message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
      <View style={styles.columns}>
        <Panel title="What came in?" style={styles.main}>
          <Field
            label="Find or add an item"
            value={search}
            onChangeText={setSearch}
            placeholder="Type to search, e.g. milk"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => (matches.length === 1 ? addExisting(matches[0]) : !exactMatch ? addNew() : undefined)}
          />
          <View style={styles.picks}>
            {matches.map((item) => {
              const added = onDelivery.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.name}`}
                  disabled={added}
                  onPress={() => addExisting(item)}
                  style={({ pressed }) => [styles.pick, added && styles.pickAdded, pressed && styles.pickPressed]}>
                  <Text style={[styles.pickName, added && styles.pickNameAdded]} numberOfLines={1}>
                    {added ? '✓ ' : ''}
                    {item.name}
                  </Text>
                  <Text style={[styles.pickMeta, item.isLow && styles.pickLow]} numberOfLines={1}>
                    {formatQuantity(item.currentStock, item.unitOfMeasure)}
                    {item.isLow ? ' · low' : ''}
                  </Text>
                </Pressable>
              );
            })}
            {needle && !exactMatch ? (
              <Pressable accessibilityRole="button" onPress={addNew} style={({ pressed }) => [styles.pick, styles.pickNew, pressed && styles.pickPressed]}>
                <Text style={styles.pickNewText} numberOfLines={1}>
                  + New item “{search.trim()}”
                </Text>
                <Text style={styles.pickMeta}>Not in the system yet</Text>
              </Pressable>
            ) : null}
          </View>
          {inventory && active.length === 0 && !needle ? <EmptyState message="No ingredients yet. Type a name above to add the first one." /> : null}

          <Text style={styles.section}>On this delivery ({lines.length})</Text>
          {lines.length === 0 ? <EmptyState message="Tap the items above as you unpack them." /> : null}
          {lines.map((line, index) => (
            <DeliveryLine
              key={line.key}
              line={line}
              autoFocus={index === lines.length - 1}
              onChange={(patch) => update(line.key, patch)}
              onRemove={() => remove(line.key)}
            />
          ))}
        </Panel>

        <Panel title="Delivery details" style={styles.side}>
          <Field label="Supplier (optional)" value={supplier} onChangeText={setSupplier} placeholder="e.g. Juhayna" />
          {anyCost ? (
            <ChipSelect
              label="Paid with"
              options={PAID_WITH.map((value) => ({ value, label: value === 'UNPAID' ? 'Not paid yet' : PAYMENT_SOURCE_LABELS[value] }))}
              selected={[paidWith]}
              onToggle={setPaidWith}
            />
          ) : (
            <Text style={styles.hint}>Costs are optional. Enter them from the invoice to keep recipe costs right.</Text>
          )}
          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Invoice number, missing items…" />
          <View style={styles.summary}>
            <Text style={styles.summaryRow}>
              {lines.length} item{lines.length === 1 ? '' : 's'}
              {lines.some((line) => !line.item) ? ` · ${lines.filter((line) => !line.item).length} new` : ''}
            </Text>
            {anyCost ? <Text style={styles.summaryTotal}>{formatEgp(totalCost)}</Text> : null}
          </View>
          <Button label="Receive delivery" onPress={() => void save()} busy={busy} disabled={lines.length === 0} large />
          {lines.length > 0 ? <Button label="Clear" variant="ghost" onPress={() => setLines([])} /> : null}
        </Panel>
      </View>
    </View>
  );
}

function DeliveryLine({ line, autoFocus, onChange, onRemove }: {
  line: Line;
  autoFocus: boolean;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const base = baseUnitOf(line);
  const big = BIG_UNIT[base];

  return (
    <View style={styles.line}>
      <View style={styles.lineHeader}>
        <View style={styles.lineTitle}>
          <Text style={styles.lineName} numberOfLines={1}>
            {lineName(line)}
          </Text>
          {line.item ? (
            <Text style={styles.pickMeta}>Now {formatQuantity(line.item.currentStock, line.item.unitOfMeasure)}</Text>
          ) : (
            <Text style={styles.newBadge}>New</Text>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${lineName(line)}`} onPress={onRemove} hitSlop={8} style={styles.remove}>
          <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {line.item ? null : (
        <ChipSelect
          label="Counted in"
          options={NEW_UNITS}
          selected={[line.newUnit]}
          onToggle={(unit) => onChange({ newUnit: unit, entryUnit: BIG_UNIT[unit] ?? unit })}
        />
      )}

      <View style={styles.lineFields}>
        <View style={styles.qty}>
          <Field label="Amount" value={line.quantity} onChangeText={(quantity) => onChange({ quantity })} keyboardType="decimal-pad" autoFocus={autoFocus} />
        </View>
        {big ? (
          <View style={styles.units}>
            {[big, base].map((unit) => (
              <Pressable
                key={unit}
                accessibilityRole="button"
                accessibilityState={{ selected: line.entryUnit === unit }}
                onPress={() => onChange({ entryUnit: unit })}
                style={[styles.unit, line.entryUnit === unit && styles.unitActive]}>
                <Text style={[styles.unitText, line.entryUnit === unit && styles.unitTextActive]}>{UNIT_LABELS[unit]}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.unitFixed}>{UNIT_LABELS[base]}</Text>
        )}
        <View style={styles.cost}>
          <Field label="Cost EGP (optional)" value={line.cost} onChangeText={(cost) => onChange({ cost })} keyboardType="decimal-pad" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  main: { flex: 3 },
  side: { flex: 2 },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pick: {
    minHeight: 52,
    minWidth: 150,
    maxWidth: 240,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickPressed: { backgroundColor: colors.surfaceMuted },
  pickAdded: { backgroundColor: colors.selected, borderColor: colors.primary },
  pickName: { fontSize: font.body, fontWeight: '600', color: colors.text },
  pickNameAdded: { color: colors.primary },
  pickMeta: { fontSize: font.small, color: colors.textMuted },
  pickLow: { color: colors.danger, fontWeight: '600' },
  pickNew: { borderStyle: 'dashed', borderColor: colors.primary },
  pickNewText: { fontSize: font.body, fontWeight: '700', color: colors.primary },
  section: { fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: space.sm },
  line: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  lineTitle: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  lineName: { flexShrink: 1, fontSize: font.large, fontWeight: '700', color: colors.text },
  newBadge: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.onAccent,
    backgroundColor: colors.accent,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  remove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  lineFields: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  qty: { width: 140 },
  units: { flexDirection: 'row', gap: space.xs, paddingBottom: 2 },
  unit: {
    minWidth: 52,
    minHeight: 48,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  unitTextActive: { color: colors.onPrimary },
  unitFixed: { fontSize: font.body, fontWeight: '600', color: colors.textMuted, paddingBottom: space.md },
  cost: { flex: 1 },
  hint: { fontSize: font.small, color: colors.textMuted },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  summaryRow: { fontSize: font.body, color: colors.textMuted },
  summaryTotal: { fontSize: font.title, fontWeight: '700', color: colors.text },
});
