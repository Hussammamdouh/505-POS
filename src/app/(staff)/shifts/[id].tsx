import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiRequest, describeError, NetworkError } from '@/lib/api';
import { formatClock, formatReceiptTime } from '@/lib/businessDay';
import { formatEgp, toPiastres } from '@/lib/money';
import { printShiftReport } from '@/lib/orderActions';
import { PAYMENT_LABELS } from '@/lib/printing/documents';
import type { PaymentMethod, ShiftOrder, ShiftReport } from '@/lib/types';
import { canManage, useApp } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { CHANNEL_LABELS, STATUS_LABELS } from '@/ui/orders/ServerOrderPanel';
import { MOVEMENT_LABELS } from '@/ui/shift/CashMoveDialog';
import { colors, font, radius, space } from '@/ui/theme';

const egp = (amount: number) => formatEgp(toPiastres(amount));

/** Everything about one shift: totals, the drawer, and every order with what was in it and how it was paid. */
export default function ShiftDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useApp((state) => state.session);
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [orders, setOrders] = useState<ShiftOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<ShiftReport>('GET', `/api/v1/shifts/${id}/report`),
      apiRequest<ShiftOrder[]>('GET', `/api/v1/shifts/${id}/orders`),
    ])
      .then(([loadedReport, loadedOrders]) => {
        if (active) {
          setReport(loadedReport);
          setOrders(loadedOrders);
        }
      })
      .catch((loadError) => active && setError(loadError instanceof NetworkError ? 'The shift details need the internet.' : describeError(loadError)));
    return () => {
      active = false;
    };
  }, [id]);

  const print = async () => {
    setPrinting(true);
    setNotice(null);
    try {
      await printShiftReport(id);
      setNotice({ tone: 'success', message: 'Shift report printed.' });
    } catch (printError) {
      setNotice({ tone: 'danger', message: describeError(printError) });
    } finally {
      setPrinting(false);
    }
  };

  if (!canManage(session)) {
    return <Banner tone="warning" message="Only managers can see past shifts." />;
  }

  const methods = [...new Set((orders ?? []).flatMap((order) => order.payments.map((payment) => payment.method)))];
  const shown = (orders ?? []).filter((order) => !method || order.payments.some((payment) => payment.method === method));
  const variance = report?.cashVariance === null || report?.cashVariance === undefined ? null : toPiastres(report.cashVariance);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Button label="‹ Back" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/shift'))} />
        <View style={styles.headerMain}>
          <Text style={styles.title}>{report ? `Shift · ${formatReceiptTime(report.openedAt)}` : 'Shift'}</Text>
          {report ? (
            <Text style={styles.meta}>
              Opened by {report.staffName} at {formatClock(report.openedAt)}
              {report.closedAt ? ` · Closed by ${report.closedByName ?? '—'} at ${formatClock(report.closedAt)}` : ' · Still open'}
            </Text>
          ) : null}
        </View>
        {report?.isClosed ? <Button label="Print report" variant="secondary" onPress={() => void print()} busy={printing} /> : null}
      </View>

      {error ? <Banner tone="danger" message={error} /> : null}
      {notice ? <Banner tone={notice.tone} message={notice.message} /> : null}

      {report ? (
        <View style={styles.cards}>
          <Card title="Sales">
            <Row label="Completed orders" value={String(report.completedOrders)} />
            <Row label="Gross sales" value={egp(report.grossSales)} />
            {report.discounts > 0 ? <Row label="Discounts" value={`− ${egp(report.discounts)}`} /> : null}
            {report.refundTotal > 0 ? <Row label="Refunds" value={`− ${egp(report.refundTotal)}`} /> : null}
            <Row label="Net sales" value={egp(report.grossSales - report.discounts - report.refundTotal)} bold />
          </Card>

          <Card title="Paid with">
            {report.paymentMethods.length === 0 ? <Text style={styles.meta}>No payments.</Text> : null}
            {report.paymentMethods.map((entry) => (
              <Row
                key={entry.method}
                label={PAYMENT_LABELS[entry.method]}
                value={egp(entry.net)}
                note={entry.refunds > 0 ? `refunds ${egp(entry.refunds)}` : undefined}
              />
            ))}
          </Card>

          <Card title="Drawer">
            <Row label="Opening float" value={egp(report.openingFloat)} />
            <Row label="Cash sales" value={`+ ${egp(report.cashSalesNet)}`} />
            {report.pettyPayouts > 0 ? <Row label="Payouts" value={`− ${egp(report.pettyPayouts)}`} /> : null}
            {report.staffLoans > 0 ? <Row label="Staff loans" value={`− ${egp(report.staffLoans)}`} /> : null}
            {report.cashDrops > 0 ? <Row label="Cash drops" value={`− ${egp(report.cashDrops)}`} /> : null}
            <Row label="Expected" value={egp(report.expectedCash)} bold />
            {report.countedCash !== null ? <Row label="Counted" value={egp(report.countedCash)} bold /> : null}
            {variance !== null ? (
              <Text style={[styles.variance, { color: variance === 0 ? colors.success : colors.danger }]}>
                {variance === 0 ? 'Drawer balanced' : `${variance > 0 ? 'Over' : 'Short'} ${formatEgp(Math.abs(variance))}`}
              </Text>
            ) : null}
            {report.notes ? <Text style={styles.meta}>Note: {report.notes}</Text> : null}
          </Card>

          {report.cashiers.length > 0 ? (
            <Card title="By cashier">
              {report.cashiers.map((cashier) => (
                <Row key={cashier.name} label={`${cashier.name} · ${cashier.orders} orders`} value={egp(cashier.netSales)} />
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}

      {report ? (
        <View style={styles.columns}>
          <View style={[styles.card, styles.ordersColumn]}>
            <Text style={styles.cardTitle}>Orders{orders ? ` · ${shown.length}` : ''}</Text>
            {methods.length > 1 ? (
              <View style={styles.filters}>
                <Chip label="All" active={method === null} onPress={() => setMethod(null)} />
                {methods.map((candidate) => (
                  <Chip key={candidate} label={PAYMENT_LABELS[candidate]} active={method === candidate} onPress={() => setMethod(candidate)} />
                ))}
              </View>
            ) : null}
            {orders?.length === 0 ? <Text style={styles.meta}>No orders were paid in this shift.</Text> : null}
            {shown.map((order) => (
              <OrderRow key={order.id} order={order} open={expanded === order.id} onToggle={() => setExpanded((current) => (current === order.id ? null : order.id))} />
            ))}
          </View>

          <View style={styles.sideColumn}>
            <Card title="Items sold">
              {report.itemsSold.length === 0 ? <Text style={styles.meta}>Nothing sold.</Text> : null}
              {report.itemsSold.map((item) => (
                <Row key={item.name} label={`${item.quantity} × ${item.name}`} value={egp(item.amount)} />
              ))}
            </Card>

            {report.cashMovements.length > 0 ? (
              <Card title="Cash moves">
                {report.cashMovements.map((movement, index) => (
                  <Row
                    key={index}
                    label={`${formatClock(movement.createdAt)} ${MOVEMENT_LABELS[movement.type]} · ${movement.reason}`}
                    value={`− ${egp(movement.amount)}`}
                    note={`by ${movement.authorizedBy}`}
                  />
                ))}
              </Card>
            ) : null}

            {report.refunds.length > 0 ? (
              <Card title="Refunds">
                {report.refunds.map((refund, index) => (
                  <Row
                    key={index}
                    label={`${formatClock(refund.createdAt)} ${refund.displayCode} · ${PAYMENT_LABELS[refund.method]}`}
                    value={`− ${egp(refund.amount)}`}
                    note={`${refund.reason} · by ${refund.authorizedBy}`}
                  />
                ))}
              </Card>
            ) : null}

            {report.cancellations.length > 0 ? (
              <Card title="Cancelled / voided">
                {report.cancellations.map((cancellation, index) => (
                  <Row
                    key={index}
                    label={`${formatClock(cancellation.createdAt)} ${cancellation.displayCode}`}
                    value={egp(cancellation.amount)}
                    note={`${cancellation.reason} · by ${cancellation.authorizedBy}`}
                  />
                ))}
              </Card>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function OrderRow({ order, open, onToggle }: { order: ShiftOrder; open: boolean; onToggle: () => void }) {
  const cancelled = order.status === 'CANCELLED';
  return (
    <View style={styles.order}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.orderHead}>
        <Text style={styles.orderTime}>{formatClock(order.createdAt)}</Text>
        <View style={styles.orderMain}>
          <Text style={[styles.orderCode, cancelled && styles.struck]}>
            {order.displayCode} · {CHANNEL_LABELS[order.channel]}
            {order.status !== 'COMPLETED' ? ` · ${STATUS_LABELS[order.status]}` : ''}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {order.payments.map((payment) => PAYMENT_LABELS[payment.method]).join(' + ')}
            {order.cashierName ? ` · ${order.cashierName}` : ''}
            {order.refunded > 0 ? ` · refunded ${egp(order.refunded)}` : ''}
          </Text>
        </View>
        <Text style={[styles.orderTotal, cancelled && styles.struck]}>{egp(order.total)}</Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.orderBody}>
          {order.items.map((item, index) => (
            <View key={index} style={styles.line}>
              <View style={styles.lineMain}>
                <Text style={styles.lineName}>
                  {item.quantity} × {item.name}
                  {item.isFree ? ' (free)' : ''}
                </Text>
                {item.modifiers.length > 0 ? <Text style={styles.meta}>{item.modifiers.join(', ')}</Text> : null}
              </View>
              <Text style={styles.lineValue}>{egp(item.lineTotal)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          {order.discount > 0 ? <Row label="Discount" value={`− ${egp(order.discount)}`} /> : null}
          <Row label="Total" value={egp(order.total)} bold />
          {order.payments.map((payment, index) => (
            <Row
              key={index}
              label={`${PAYMENT_LABELS[payment.method]} at ${formatClock(payment.createdAt)}`}
              value={egp(payment.amount)}
              note={[
                payment.amountTendered !== null ? `received ${egp(payment.amountTendered)}` : null,
                payment.changeGiven > 0 ? `change ${egp(payment.changeGiven)}` : null,
                payment.referenceNumber ? `ref ${payment.referenceNumber}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined}
            />
          ))}
          {order.customerName ? <Text style={styles.meta}>Customer: {order.customerName}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.card, styles.cardFlex]}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, note, bold }: { label: string; value: string; note?: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <Text style={[styles.rowValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  headerMain: { flex: 1, minWidth: 240, gap: 2 },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.small, color: colors.textMuted },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'flex-start' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  cardFlex: { flexGrow: 1, flexBasis: 260 },
  cardTitle: { fontSize: font.large, fontWeight: '700', color: colors.text },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'flex-start' },
  ordersColumn: { flexGrow: 3, flexBasis: 420 },
  sideColumn: { flexGrow: 2, flexBasis: 300, gap: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm },
  rowMain: { flex: 1 },
  rowLabel: { fontSize: font.body, color: colors.text },
  rowValue: { fontSize: font.body, color: colors.text },
  note: { fontSize: 12, color: colors.textMuted },
  bold: { fontWeight: '700' },
  variance: { fontSize: font.large, fontWeight: '700' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: 999, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.small, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.onPrimary },
  order: { borderTopWidth: 1, borderTopColor: colors.border },
  orderHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: 52 },
  orderTime: { width: 52, fontSize: font.small, color: colors.textMuted },
  orderMain: { flex: 1, gap: 2 },
  orderCode: { fontSize: font.body, fontWeight: '700', color: colors.text },
  orderTotal: { fontSize: font.body, fontWeight: '700', color: colors.text },
  struck: { textDecorationLine: 'line-through', color: colors.textMuted },
  chevron: { width: 16, fontSize: font.body, color: colors.textMuted },
  orderBody: { gap: space.xs, paddingBottom: space.md, paddingLeft: 52 + space.md },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  lineMain: { flex: 1 },
  lineName: { fontSize: font.body, color: colors.text },
  lineValue: { fontSize: font.body, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
});
