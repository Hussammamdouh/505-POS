import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { formatClock, todayBusinessDate } from '@/lib/businessDay';
import { payExistingOrder } from '@/lib/checkout';
import { outboxForDate, outboxGet, outboxMarkSynced, outboxRetry, type OutboxEntry } from '@/lib/db';
import { balanceDue, fromServerOrder, type LocalOrderPayment } from '@/lib/localOrder';
import { formatEgp, formatMoney, toPiastres } from '@/lib/money';
import { fetchOrder, searchOrders } from '@/lib/orderActions';
import { PAYMENT_LABELS } from '@/lib/printing/documents';
import { printOrderReceipt } from '@/lib/printing/printer';
import { refreshSyncCount, runSync } from '@/lib/sync';
import type { Order, OrderChannel, OrderSummary } from '@/lib/types';
import { useApp } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { CHANNEL_LABELS, ServerOrderPanel, STATUS_LABELS } from '@/ui/orders/ServerOrderPanel';
import { PaymentSheet } from '@/ui/register/PaymentSheet';
import { colors, font, radius, space } from '@/ui/theme';

const SYNC_LABELS: Record<OutboxEntry['status'], { text: string; color: string }> = {
  SUBMITTING: { text: 'Sending…', color: colors.textMuted },
  PENDING: { text: 'Waiting to sync', color: colors.warning },
  SYNCED: { text: 'Synced', color: colors.success },
  FAILED: { text: 'Sync failed', color: colors.danger },
};

type Mode = 'inhouse' | 'talabat' | 'website' | 'search';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'inhouse', label: 'In-house' },
  { mode: 'talabat', label: 'Talabat' },
  { mode: 'website', label: 'Website' },
  { mode: 'search', label: 'Search' },
];

const CHANNEL_OF_MODE: Partial<Record<Mode, OrderChannel>> = { talabat: 'TALABAT', website: 'WEB' };

// Today's orders from the server are refreshed this often while a channel tab is open.
const CHANNEL_REFRESH_MS = 20000;
type Feedback = { tone: 'success' | 'danger'; message: string } | null;

async function rememberServerOrder(order: Order) {
  const entry = await outboxGet(order.id);
  if (entry?.status === 'SYNCED') {
    await outboxMarkSynced(order.id, order.displayCode, fromServerOrder(order, entry.snapshot.cashierName));
  }
}

export default function OrdersScreen() {
  const [mode, setMode] = useState<Mode>('inhouse');
  const [serverOrder, setServerOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openServerOrder = async (orderId: string) => {
    setLoadError(null);
    try {
      setServerOrder(await fetchOrder(orderId));
    } catch (error) {
      setLoadError(error instanceof NetworkError ? 'Opening the full order needs the internet.' : describeError(error));
    }
  };

  const serverChanged = (order: Order) => {
    setServerOrder(order);
    void rememberServerOrder(order);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.listPane}>
        <View style={styles.segment}>
          {MODES.map((option) => (
            <Pressable
              key={option.mode}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === option.mode }}
              onPress={() => {
                setMode(option.mode);
                setServerOrder(null);
              }}
              style={[styles.segmentOption, mode === option.mode && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === option.mode && styles.segmentTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        {loadError ? <Banner tone="danger" message={loadError} /> : null}
        {mode === 'inhouse' ? (
          <LocalOrders onOpenServerOrder={(id) => void openServerOrder(id)} hideDetail={serverOrder !== null} onSelect={() => setServerOrder(null)} />
        ) : mode === 'search' ? (
          <SearchOrders onOpen={(id) => void openServerOrder(id)} selectedId={serverOrder?.id ?? null} />
        ) : (
          <ChannelOrders
            key={mode}
            channel={CHANNEL_OF_MODE[mode]!}
            onOpen={(id) => void openServerOrder(id)}
            selectedId={serverOrder?.id ?? null}
            changed={serverOrder}
          />
        )}
      </View>

      {serverOrder ? (
        <View style={styles.detailPane}>
          <ServerOrderPanel key={serverOrder.id} order={serverOrder} onChanged={serverChanged} />
        </View>
      ) : mode === 'search' ? (
        <View style={styles.detailPane}>
          <Text style={styles.empty}>Search by order code (POS-012, WEB-3, OFF-A07) or by the customer phone, then select an order.</Text>
        </View>
      ) : mode !== 'inhouse' ? (
        <View style={styles.detailPane}>
          <Text style={styles.empty}>Select an order to see it, reprint the receipt, refund or cancel.</Text>
        </View>
      ) : null}
    </View>
  );
}

function LocalOrders({
  onOpenServerOrder,
  hideDetail,
  onSelect,
}: {
  onOpenServerOrder: (orderId: string) => void;
  hideDetail: boolean;
  onSelect: () => void;
}) {
  const unsyncedCount = useApp((state) => state.unsyncedCount);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const reload = async () => setEntries(await outboxForDate(todayBusinessDate()));

  useEffect(() => {
    let active = true;
    void outboxForDate(todayBusinessDate()).then((rows) => active && setEntries(rows));
    return () => {
      active = false;
    };
  }, [unsyncedCount, hideDetail]);

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  const run = async (label: string, task: () => Promise<string>) => {
    setBusy(label);
    setFeedback(null);
    try {
      setFeedback({ tone: 'success', message: await task() });
    } catch (error) {
      setFeedback({ tone: 'danger', message: describeError(error) });
    } finally {
      setBusy(null);
      await reload();
    }
  };

  const pay = async (entry: OutboxEntry, payments: LocalOrderPayment[]) => {
    setBusy('pay');
    setPayError(null);
    try {
      const result = await payExistingOrder(entry.id, payments);
      setPaying(false);
      setFeedback(
        result.printError
          ? { tone: 'danger', message: `Payment saved, but printing failed: ${result.printError}` }
          : { tone: 'success', message: 'Payment saved and receipt printed.' },
      );
    } catch (error) {
      setPayError(describeError(error));
    } finally {
      setBusy(null);
      await reload();
    }
  };

  return (
    <View style={styles.localLayout}>
      <FlatList
        style={styles.list}
        data={entries}
        keyExtractor={(entry) => entry.id}
        ListEmptyComponent={<Text style={styles.empty}>No orders yet today.</Text>}
        renderItem={({ item: entry }) => {
          const due = balanceDue(entry.snapshot);
          const sync = SYNC_LABELS[entry.status];
          return (
            <Pressable
              onPress={() => {
                setSelectedId(entry.id);
                setFeedback(null);
                onSelect();
              }}
              style={[styles.row, entry.id === selectedId && styles.rowActive]}>
              <View style={styles.rowMain}>
                <Text style={styles.code}>{entry.snapshot.displayCode || entry.offlineCode || '—'}</Text>
                <Text style={styles.meta}>
                  {formatClock(entry.createdAt)} · {entry.snapshot.cashierName}
                </Text>
              </View>
              <View style={styles.rowSide}>
                <Text style={styles.amount}>{formatMoney(entry.snapshot.netAmountDue)}</Text>
                <Text style={[styles.badge, { color: entry.snapshot.isCancelled ? colors.danger : due > 0 ? colors.warning : colors.textMuted }]}>
                  {entry.snapshot.isCancelled ? 'Cancelled' : due > 0 ? 'Unpaid' : 'Paid'}
                </Text>
                <Text style={[styles.badge, { color: sync.color }]}>{sync.text}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      {selected && !hideDetail ? (
        <ScrollView style={styles.localDetail} contentContainerStyle={styles.detail}>
          <Text style={styles.detailCode}>{selected.snapshot.displayCode}</Text>
          {selected.snapshot.offlineCode && selected.snapshot.offlineCode !== selected.snapshot.displayCode ? (
            <Text style={styles.meta}>Offline ref {selected.snapshot.offlineCode}</Text>
          ) : null}
          {selected.lastError ? <Banner tone="danger" message={`Sync problem: ${selected.lastError}`} /> : null}

          <View style={styles.lines}>
            {selected.snapshot.lines.map((line, index) => (
              <View key={index} style={styles.line}>
                <Text style={styles.lineName}>
                  {line.quantity} × {line.name}
                  {line.modifiers.length > 0 ? `\n${line.modifiers.map((modifier) => modifier.name).join(', ')}` : ''}
                </Text>
                <Text style={styles.lineAmount}>{formatMoney(line.totalLinePrice)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totals}>
            <Text style={styles.totalText}>Total {formatEgp(selected.snapshot.netAmountDue)}</Text>
            {selected.snapshot.payments.map((payment, index) => (
              <Text key={index} style={styles.meta}>
                {PAYMENT_LABELS[payment.method]} {formatEgp(payment.amount)}
              </Text>
            ))}
            {balanceDue(selected.snapshot) > 0 && !selected.snapshot.isCancelled ? (
              <Text style={[styles.totalText, { color: colors.warning }]}>Due {formatEgp(balanceDue(selected.snapshot))}</Text>
            ) : null}
          </View>

          {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

          <View style={styles.actions}>
            {selected.status === 'SYNCED' ? (
              <Button label="Open full order (refund, cancel…)" onPress={() => onOpenServerOrder(selected.id)} large />
            ) : null}
            {selected.status !== 'SYNCED' && balanceDue(selected.snapshot) > 0 && !selected.snapshot.isCancelled ? (
              <Button
                label="Take payment"
                onPress={() => {
                  setPayError(null);
                  setPaying(true);
                }}
                large
              />
            ) : null}
            <Button
              label="Reprint receipt"
              variant="secondary"
              onPress={() =>
                void run('reprint', async () => {
                  await printOrderReceipt(useApp.getState().settings!, selected.snapshot, true);
                  return 'Receipt reprinted.';
                })
              }
              busy={busy === 'reprint'}
            />
            {selected.status === 'FAILED' ? (
              <Button
                label="Retry sync"
                variant="secondary"
                onPress={() =>
                  void run('retry', async () => {
                    await outboxRetry(selected.id);
                    await refreshSyncCount();
                    await runSync();
                    return 'Sync retried. Check the status in the list.';
                  })
                }
                busy={busy === 'retry'}
              />
            ) : null}
          </View>
        </ScrollView>
      ) : null}

      {selected && paying ? (
        <PaymentSheet
          amountDue={balanceDue(selected.snapshot)}
          busy={busy === 'pay'}
          error={payError}
          onConfirm={(payments) => void pay(selected, payments)}
          onClose={() => setPaying(false)}
        />
      ) : null}
    </View>
  );
}

/** Today's orders for one channel, from the server. */
function ChannelOrders({
  channel,
  onOpen,
  selectedId,
  changed,
}: {
  channel: OrderChannel;
  onOpen: (orderId: string) => void;
  selectedId: string | null;
  changed: Order | null;
}) {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const today = todayBusinessDate();
      try {
        const found = await searchOrders({ from: today, to: today, channel });
        if (active) {
          setOrders(found.orders);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof NetworkError ? 'These orders are on the server, so showing them needs the internet.' : describeError(loadError));
        }
      }
    };

    void load();
    const timer = setInterval(() => void load(), CHANNEL_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // Reloads when an opened order changes (paid, refunded or cancelled).
  }, [channel, changed]);

  const total = (orders ?? []).filter((order) => order.status !== 'CANCELLED').reduce((sum, order) => sum + toPiastres(order.netAmountDue), 0);

  return (
    <View style={styles.searchPane}>
      {error ? <Banner tone="warning" message={error} /> : null}
      {orders ? (
        <Text style={styles.summary}>
          {orders.length} order{orders.length === 1 ? '' : 's'} today · {formatEgp(total)}
        </Text>
      ) : null}
      <FlatList
        data={orders ?? []}
        keyExtractor={(order) => order.id}
        ListEmptyComponent={orders ? <Text style={styles.empty}>No orders today.</Text> : undefined}
        renderItem={({ item: order }) => <SummaryRow order={order} selected={order.id === selectedId} onPress={() => onOpen(order.id)} />}
      />
    </View>
  );
}

function SummaryRow({ order, selected, onPress }: { order: OrderSummary; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, selected && styles.rowActive]}>
      <View style={styles.rowMain}>
        <Text style={styles.code}>
          {order.displayCode}
          {order.offlineCode ? <Text style={styles.meta}> · {order.offlineCode}</Text> : null}
        </Text>
        <Text style={styles.meta}>
          {formatClock(order.createdAt)} · {CHANNEL_LABELS[order.channel]}
          {order.cashierName ? ` · ${order.cashierName}` : ''}
          {order.customerName ? ` · ${order.customerName}` : ''}
        </Text>
      </View>
      <View style={styles.rowSide}>
        <Text style={styles.amount}>{formatMoney(toPiastres(order.netAmountDue))}</Text>
        <Text style={[styles.badge, { color: order.status === 'CANCELLED' ? colors.danger : colors.textMuted }]}>
          {STATUS_LABELS[order.status]}
          {order.amountRefunded > 0 ? ' · refunded' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function SearchOrders({ onOpen, selectedId }: { onOpen: (orderId: string) => void; selectedId: string | null }) {
  const [date, setDate] = useState(todayBusinessDate());
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setError('Date must look like 2026-10-27.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const found = await searchOrders({ from: date.trim(), to: date.trim(), code: code.trim() || undefined, phone: phone.trim() || undefined });
      setResults(found.orders);
    } catch (searchError) {
      setError(searchError instanceof NetworkError ? 'Searching needs the internet.' : describeError(searchError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.searchPane}>
      <View style={styles.searchForm}>
        <View style={styles.dateField}>
          <Field label="Business date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCorrect={false} />
        </View>
        <View style={styles.grow}>
          <Field label="Order code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="POS-012" />
        </View>
        <View style={styles.grow}>
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Full or last 4 digits" />
        </View>
        <Button label="Search" onPress={() => void search()} busy={busy} />
      </View>
      {error ? <Banner tone="danger" message={error} /> : null}
      <FlatList
        data={results ?? []}
        keyExtractor={(order) => order.id}
        ListEmptyComponent={results ? <Text style={styles.empty}>No orders found.</Text> : undefined}
        renderItem={({ item: order }) => <SummaryRow order={order} selected={order.id === selectedId} onPress={() => onOpen(order.id)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row' },
  listPane: { flex: 1, padding: space.lg, gap: space.md },
  segment: { flexDirection: 'row', gap: space.sm, maxWidth: 680 },
  segmentOption: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  segmentText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  segmentTextActive: { color: colors.primary },
  localLayout: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { flex: 1 },
  empty: { fontSize: font.body, color: colors.textMuted, padding: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  rowMain: { flex: 1, gap: 2 },
  rowSide: { alignItems: 'flex-end', gap: 2 },
  code: { fontSize: font.large, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.small, color: colors.textMuted, fontWeight: '400' },
  amount: { fontSize: font.large, fontWeight: '600', color: colors.text },
  badge: { fontSize: font.small, fontWeight: '700' },
  localDetail: { width: 400, flexGrow: 0, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  detail: { padding: space.lg, gap: space.md },
  detailCode: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  lines: { gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { flex: 1, fontSize: font.body, color: colors.text },
  lineAmount: { fontSize: font.body, color: colors.text },
  totals: { gap: space.xs },
  totalText: { fontSize: font.large, fontWeight: '700', color: colors.text },
  actions: { gap: space.sm },
  detailPane: { width: 440, backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border },
  searchPane: { flex: 1, gap: space.md },
  summary: { fontSize: font.body, fontWeight: '600', color: colors.textMuted },
  searchForm: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  dateField: { width: 170 },
  grow: { flex: 1 },
});
