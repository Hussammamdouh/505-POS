import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatReceiptTime } from '@/lib/businessDay';
import { formatQuantity, loadInventory, loadMovements, UNIT_LABELS } from '@/lib/inventory';
import type { InventoryItem, InventoryMovement, InventoryTransaction } from '@/lib/types';
import { isAdmin, useApp } from '@/store/app';
import { EmptyState, ListRow, Panel } from '@/ui/admin/AdminKit';
import { errorMessage } from '@/ui/admin/MenuForms';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { IngredientForm } from '@/ui/inventory/IngredientForm';
import { sortForAttention } from '@/ui/inventory/IngredientLevels';
import { MovementForm, type MovementKind } from '@/ui/inventory/MovementForm';
import { compactEgp, KpiRow, StatTile } from '@/ui/reports/ReportKit';
import { colors, font, space } from '@/ui/theme';

type Feedback = { tone: 'success' | 'danger'; message: string } | null;
type Pane = { kind: 'details' } | { kind: 'edit' } | { kind: 'move'; movement: MovementKind };

const MOVEMENT_LABELS: Record<InventoryMovement, string> = {
  SALE_DEPLETION: 'Sold',
  PURCHASE_RECEIPT: 'Delivery',
  WASTE_SPOILAGE: 'Waste',
  AUDIT_ADJUSTMENT: 'Count',
  ORDER_REFUND_RESTOCK: 'Restock',
};

export default function InventoryAdminScreen() {
  const admin = isAdmin(useApp((state) => state.session));
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [pane, setPane] = useState<Pane>({ kind: 'details' });
  const [history, setHistory] = useState<InventoryTransaction[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const fail = useCallback((error: unknown) => setFeedback({ tone: 'danger', message: errorMessage(error) }), []);

  useEffect(() => {
    let active = true;
    loadInventory()
      .then((loaded) => active && setItems(loaded))
      .catch((error) => active && fail(error));

    return () => {
      active = false;
    };
  }, [fail]);

  const openItem = (id: string | 'new', nextPane: Pane = { kind: id === 'new' ? 'edit' : 'details' }) => {
    setSelected(id);
    setPane(nextPane);
    setFeedback(null);
    setHistory([]);
    if (id !== 'new') {
      loadMovements(id).then(setHistory).catch(fail);
    }
  };

  const upsert = (updated: InventoryItem, message: string) => {
    setItems((current) => {
      const list = current ?? [];
      return list.some((item) => item.id === updated.id) ? list.map((item) => (item.id === updated.id ? updated : item)) : [...list, updated];
    });
    setSelected(updated.id);
    setPane({ kind: 'details' });
    setFeedback({ tone: 'success', message });
    loadMovements(updated.id).then(setHistory).catch(fail);
  };

  const list = admin ? [...(items ?? [])].sort((a, b) => Number(b.isLow) - Number(a.isLow) || a.name.localeCompare(b.name)) : sortForAttention(items ?? []);
  const item = selected && selected !== 'new' ? items?.find((candidate) => candidate.id === selected) ?? null : null;
  const stockValue = (items ?? []).reduce((sum, candidate) => sum + candidate.stockValue, 0);
  const lowCount = (items ?? []).filter((candidate) => candidate.isLow).length;

  return (
    <View style={styles.screen}>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

        <>
          <KpiRow>
            <StatTile label="Stock value" value={compactEgp(stockValue)} caption="At average cost" />
            <StatTile label="Ingredients" value={String((items ?? []).filter((candidate) => candidate.isActive).length)} />
            <StatTile
              label="Running low"
              value={String(lowCount)}
              status={lowCount > 0 ? { tone: 'bad', text: 'Order more' } : { tone: 'good', text: 'All stocked' }}
            />
          </KpiRow>
          <View style={styles.columns}>
            <Panel title="Ingredients" style={styles.list} action={admin ? <Button label="+ New" onPress={() => openItem('new')} /> : null}>
              {list.map((candidate) => (
                <ListRow
                  key={candidate.id}
                  title={candidate.name}
                  subtitle={`${formatQuantity(candidate.currentStock, candidate.unitOfMeasure)} · ${candidate.costPerUnit} EGP/${UNIT_LABELS[candidate.unitOfMeasure]}`}
                  badge={!candidate.isActive ? 'Inactive' : candidate.isLow ? 'Low' : null}
                  badgeTone="danger"
                  dimmed={!candidate.isActive}
                  selected={candidate.id === selected}
                  onPress={() => openItem(candidate.id)}
                />
              ))}
              {items?.length === 0 ? (
                <EmptyState message={admin ? 'Add the ingredients you buy: beans, milk, cups, syrups…' : 'No ingredients set up yet.'} />
              ) : null}
            </Panel>

            <View style={styles.detail}>
              {selected === 'new' || (item && pane.kind === 'edit') ? (
                <IngredientForm key={selected} item={item} onSaved={upsert} onError={fail} />
              ) : item && pane.kind === 'move' ? (
                <MovementForm
                  key={`${item.id}-${pane.movement}`}
                  item={item}
                  kind={pane.movement}
                  onDone={upsert}
                  onError={fail}
                  onCancel={() => setPane({ kind: 'details' })}
                />
              ) : item ? (
                <Panel title={item.name}>
                  <Text style={styles.big}>{formatQuantity(item.currentStock, item.unitOfMeasure)} in stock</Text>
                  <Text style={styles.hint}>
                    Warn below {formatQuantity(item.minStockAlert, item.unitOfMeasure)} · average cost {item.costPerUnit} EGP per{' '}
                    {UNIT_LABELS[item.unitOfMeasure]} · worth {compactEgp(item.stockValue)} EGP · used in {item.usedInRecipes} recipe(s)
                  </Text>
                  <View style={styles.actions}>
                    <Button label="Receive delivery" onPress={() => setPane({ kind: 'move', movement: 'PURCHASE_RECEIPT' })} />
                    <Button label="Stock count" variant="secondary" onPress={() => setPane({ kind: 'move', movement: 'AUDIT_ADJUSTMENT' })} />
                    <Button label="Log waste" variant="secondary" onPress={() => setPane({ kind: 'move', movement: 'WASTE_SPOILAGE' })} />
                    {admin ? <Button label="Edit" variant="ghost" onPress={() => setPane({ kind: 'edit' })} /> : null}
                  </View>
                  <Text style={styles.section}>Recent movements</Text>
                  {history.map((entry) => (
                    <View key={entry.id} style={styles.historyRow}>
                      <Text style={styles.historyWhen}>{formatReceiptTime(entry.createdAt)}</Text>
                      <Text style={styles.historyWhat}>
                        {MOVEMENT_LABELS[entry.movementType]}
                        {entry.orderDisplayCode ? ` ${entry.orderDisplayCode}` : ''}
                        {entry.reasonNotes && !entry.orderDisplayCode ? ` · ${entry.reasonNotes}` : ''}
                        {entry.totalCost !== null ? ` · ${entry.totalCost.toFixed(2)} EGP` : ''}
                        {entry.supplierName ? ` · ${entry.supplierName}` : ''}
                        {entry.staffName ? ` · ${entry.staffName}` : ''}
                      </Text>
                      <Text style={styles.historyQty}>
                        {entry.quantityChange > 0 ? '+' : '−'}
                        {formatQuantity(Math.abs(entry.quantityChange), item.unitOfMeasure)}
                      </Text>
                    </View>
                  ))}
                  {history.length === 0 ? <Text style={styles.hint}>No movements yet.</Text> : null}
                </Panel>
              ) : (
                <Panel scroll={false}>
                  <EmptyState message="Pick an ingredient to receive a delivery, count stock, log waste or see its history." />
                </Panel>
              )}
            </View>
          </View>
        </>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between' },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { width: 380 },
  detail: { flex: 1 },
  big: { fontSize: 28, fontWeight: '600', color: colors.text },
  hint: { fontSize: font.small, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  section: { fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: space.sm },
  group: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginTop: space.md, marginLeft: space.sm },
  historyRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyWhen: { width: 130, fontSize: font.small, color: colors.textMuted },
  historyWhat: { flex: 1, fontSize: font.small, color: colors.text },
  historyQty: { width: 110, textAlign: 'right', fontSize: font.small, color: colors.text, fontVariant: ['tabular-nums'] },
});
