import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { formatQuantity, loadInventory } from '@/lib/inventory';
import type { InventoryItem } from '@/lib/types';

import { EmptyState, ListRow, Panel } from '../admin/AdminKit';
import { Banner } from '../Banner';
import { Button } from '../Button';
import { colors, font, space } from '../theme';
import { MovementForm } from './MovementForm';

type Feedback = { tone: 'success' | 'danger'; message: string } | null;

const errorText = (error: unknown) => (error instanceof NetworkError ? 'Ingredient stock needs the internet.' : describeError(error));

/** Low items first, then alphabetical; inactive ingredients are hidden. */
export const sortForAttention = (items: InventoryItem[]) =>
  items.filter((item) => item.isActive).sort((a, b) => Number(b.isLow) - Number(a.isLow) || a.name.localeCompare(b.name));

/** Ingredient levels for every staff member, with waste logging (the only stock change baristas may make). */
export function IngredientLevels() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [wasting, setWasting] = useState<InventoryItem | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let active = true;
    loadInventory()
      .then((loaded) => active && setItems(loaded))
      .catch((error) => active && setFeedback({ tone: 'danger', message: errorText(error) }));
    return () => {
      active = false;
    };
  }, []);

  const replace = useCallback((updated: InventoryItem) => {
    setItems((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
  }, []);

  const visible = sortForAttention(items ?? []);
  const lowCount = visible.filter((item) => item.isLow).length;

  return (
    <View style={styles.screen}>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
      {lowCount > 0 ? <Banner tone="warning" message={`${lowCount} ingredient${lowCount > 1 ? 's are' : ' is'} running low. Tell a manager.`} /> : null}
      <View style={styles.columns}>
        <Panel title="Ingredients" style={styles.list}>
          {visible.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.grow}>
                <ListRow
                  title={item.name}
                  subtitle={`${formatQuantity(item.currentStock, item.unitOfMeasure)} in stock · alert at ${formatQuantity(item.minStockAlert, item.unitOfMeasure)}`}
                  badge={item.isLow ? 'Low' : null}
                  badgeTone="danger"
                  selected={wasting?.id === item.id}
                  onPress={() => setWasting(item)}
                />
              </View>
              <Button label="Log waste" variant="secondary" onPress={() => { setWasting(item); setFeedback(null); }} />
            </View>
          ))}
          {items?.length === 0 ? <EmptyState message="No ingredients set up yet. An admin adds them under Admin → Inventory." /> : null}
        </Panel>
        <View style={styles.side}>
          {wasting ? (
            <MovementForm
              key={wasting.id}
              item={wasting}
              kind="WASTE_SPOILAGE"
              onDone={(updated, message) => {
                replace(updated);
                setWasting(null);
                setFeedback({ tone: 'success', message });
              }}
              onError={(error) => setFeedback({ tone: 'danger', message: errorText(error) })}
              onCancel={() => setWasting(null)}
            />
          ) : (
            <Panel scroll={false}>
              <Text style={styles.hint}>
                Log anything thrown away: spilled milk, expired pastries, shots pulled while dialling in. Sales are taken off stock
                automatically.
              </Text>
            </Panel>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { flex: 3 },
  side: { flex: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
  hint: { fontSize: font.body, color: colors.textMuted },
});
