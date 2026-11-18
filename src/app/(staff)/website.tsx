import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatClock } from '@/lib/businessDay';
import { upsertOpenOrder } from '@/lib/liveOrders';
import { formatMoney, toPiastres } from '@/lib/money';
import type { Order, OrderStatus } from '@/lib/types';
import { useApp } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { CHANNEL_LABELS, ServerOrderPanel } from '@/ui/orders/ServerOrderPanel';
import { colors, font, radius, space } from '@/ui/theme';

const COLUMNS: { title: string; statuses: OrderStatus[] }[] = [
  { title: 'New', statuses: ['PENDING'] },
  { title: 'In progress', statuses: ['ACCEPTED', 'PREPARING'] },
  { title: 'Ready', statuses: ['READY'] },
];

// Website orders are the only ones that move through New, In progress and Ready.
export default function WebsiteOrdersScreen() {
  const allOpenOrders = useApp((state) => state.openOrders);
  const openOrders = allOpenOrders.filter((order) => order.channel === 'WEB');
  const connectivity = useApp((state) => state.connectivity);
  const hasToken = useApp((state) => Boolean(state.session?.token));
  const [selected, setSelected] = useState<Order | null>(null);

  const current = selected ? (openOrders.find((order) => order.id === selected.id) ?? selected) : null;

  const changed = (order: Order) => {
    upsertOpenOrder(order);
    setSelected(order);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.board}>
        {connectivity === 'offline' || !hasToken ? (
          <Banner tone="warning" message="Website orders need the internet. They will appear here when the connection is back." />
        ) : null}
        <View style={styles.columns}>
          {COLUMNS.map((column) => {
            const orders = openOrders
              .filter((order) => column.statuses.includes(order.status))
              .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
            return (
              <View key={column.title} style={styles.column}>
                <Text style={styles.columnTitle}>
                  {column.title} <Text style={styles.count}>{orders.length}</Text>
                </Text>
                <ScrollView contentContainerStyle={styles.cards}>
                  {orders.map((order) => (
                    <Pressable
                      key={order.id}
                      onPress={() => setSelected(order)}
                      style={[styles.card, order.status === 'PENDING' && styles.cardNew, current?.id === order.id && styles.cardSelected]}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.code}>{order.displayCode}</Text>
                        <Text style={styles.channel}>{CHANNEL_LABELS[order.channel]}</Text>
                      </View>
                      <Text style={styles.meta}>
                        {formatClock(order.createdAt)}
                        {order.customerName ? ` · ${order.customerName}` : ''}
                      </Text>
                      <Text style={styles.items} numberOfLines={2}>
                        {order.items.map((item) => `${item.quantity}× ${item.itemName}`).join(', ')}
                      </Text>
                      <Text style={styles.amount}>
                        {order.balanceDue > 0 ? `Collect ${formatMoney(toPiastres(order.balanceDue))}` : 'Paid'}
                      </Text>
                    </Pressable>
                  ))}
                  {orders.length === 0 ? <Text style={styles.empty}>Nothing here</Text> : null}
                </ScrollView>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.detail}>
        {current ? (
          <ServerOrderPanel key={current.id} order={current} onChanged={changed} />
        ) : (
          <Text style={styles.empty}>Select an order. New website orders ring until accepted.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row' },
  board: { flex: 1, padding: space.lg, gap: space.md },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  column: { flex: 1, gap: space.sm },
  columnTitle: { fontSize: font.large, fontWeight: '700', color: colors.text },
  count: { color: colors.textMuted, fontWeight: '500' },
  cards: { gap: space.sm, paddingBottom: space.lg },
  card: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    gap: space.xs,
  },
  cardNew: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  cardSelected: { borderColor: colors.primary },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  code: { fontSize: font.large, fontWeight: '800', color: colors.text },
  channel: { fontSize: font.small, fontWeight: '700', color: colors.primary },
  meta: { fontSize: font.small, color: colors.textMuted },
  items: { fontSize: font.body, color: colors.text },
  amount: { fontSize: font.body, fontWeight: '700', color: colors.text },
  empty: { fontSize: font.body, color: colors.textMuted, padding: space.lg },
  detail: { width: 440, backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border },
});
