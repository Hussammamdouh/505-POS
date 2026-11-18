import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PAYMENT_LABELS } from '@/lib/printing/documents';
import { loadSalesInsights, type DateRange } from '@/lib/reports';
import type { OrderChannel, SalesInsights } from '@/lib/types';
import { Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { ColumnChart, type ColumnDatum } from '@/ui/reports/ColumnChart';
import { BarList, compactEgp, DataTable, DateRangeBar, egp, KpiRow, presetRange, StatTile, type Column } from '@/ui/reports/ReportKit';
import { useReport } from '@/ui/reports/useReport';
import { colors, font, space } from '@/ui/theme';

const CHANNEL_LABELS: Record<OrderChannel, string> = { POS: 'In store', WEB: 'Website', TALABAT: 'Talabat' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LIST_SIZE = 10;

type Item = SalesInsights['items'][number];

const dayName = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
const describe = (label: string, netSales: number, orders: number) => `${label}: ${egp(netSales)} EGP · ${orders} order${orders === 1 ? '' : 's'}`;

/** Daily columns up to a month; weekly up to ~4 months; monthly beyond, so columns stay readable. */
function salesOverTime(days: SalesInsights['byDay']): { data: ColumnDatum[]; unit: string; labelEvery: number } {
  if (days.length <= 31) {
    return {
      unit: 'day',
      labelEvery: days.length > 14 ? 3 : 1,
      data: days.map((day) => ({
        key: day.date,
        label: days.length > 14 ? day.date.slice(8) : `${dayName(day.date)} ${Number(day.date.slice(8))}`,
        value: day.netSales,
        detail: describe(`${dayName(day.date)} ${day.date}`, day.netSales, day.orders),
      })),
    };
  }

  const weekly = days.length <= 120;
  const buckets = new Map<string, { label: string; detail: string; netSales: number; orders: number }>();
  days.forEach((day, index) => {
    const key = weekly ? days[index - (index % 7)].date : day.date.slice(0, 7);
    const bucket = buckets.get(key) ?? {
      label: weekly ? `${Number(key.slice(8))}/${Number(key.slice(5, 7))}` : MONTHS[Number(key.slice(5, 7)) - 1],
      detail: weekly ? `Week from ${key}` : `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
      netSales: 0,
      orders: 0,
    };
    bucket.netSales += day.netSales;
    bucket.orders += day.orders;
    buckets.set(key, bucket);
  });

  return {
    unit: weekly ? 'week' : 'month',
    labelEvery: 1,
    data: [...buckets.entries()].map(([key, bucket]) => ({
      key,
      label: bucket.label,
      value: bucket.netSales,
      detail: describe(bucket.detail, bucket.netSales, bucket.orders),
    })),
  };
}

const ITEM_COLUMNS: Column<Item>[] = [
  { title: 'Item', render: (item) => item.name },
  { title: 'Category', width: 140, render: (item) => item.categoryName ?? '—' },
  { title: 'Sold', width: 60, numeric: true, render: (item) => String(item.quantity) },
  { title: 'Revenue', width: 100, numeric: true, render: (item) => egp(item.netRevenue) },
];

export default function SalesReportScreen() {
  const [range, setRange] = useState<DateRange>(presetRange('week'));
  const { data: sales, error, loading } = useReport(loadSalesInsights, range);

  const overTime = sales ? salesOverTime(sales.byDay) : null;
  // Show the opening hours actually traded (first to last hour with sales), not all 24.
  const tradedHours = sales?.byHour.filter((hour) => hour.orders > 0) ?? [];
  const hours =
    sales && tradedHours.length > 0
      ? sales.byHour.slice(tradedHours[0].hour, tradedHours[tradedHours.length - 1].hour + 1).map((hour) => ({
          key: String(hour.hour),
          label: String(hour.hour).padStart(2, '0'),
          value: hour.netSales,
          detail: describe(`${String(hour.hour).padStart(2, '0')}:00–${String(hour.hour + 1).padStart(2, '0')}:00`, hour.netSales, hour.orders),
        }))
      : [];
  const share = (value: number) => (sales && sales.netSales > 0 ? ` · ${Math.round((value / sales.netSales) * 100)}%` : '');
  const sold = sales?.items.filter((item) => item.quantity > 0) ?? [];
  const slowest = [...(sales?.items ?? [])].sort((a, b) => a.quantity - b.quantity || a.netRevenue - b.netRevenue).slice(0, LIST_SIZE);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <DateRangeBar initial="week" onChange={setRange} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {loading && !sales ? <Text style={styles.muted}>Loading…</Text> : null}

      {sales && overTime ? (
        <View style={[styles.content, loading && styles.stale]}>
          <KpiRow>
            <StatTile label="Net sales" value={compactEgp(sales.netSales)} />
            <StatTile label="Orders" value={String(sales.completedOrders)} caption={sales.cancelledOrders ? `${sales.cancelledOrders} cancelled` : undefined} />
            <StatTile label="Average order" value={compactEgp(sales.averageOrderValue)} />
            <StatTile label="Items sold" value={String(sales.itemsSold)} />
          </KpiRow>

          <Panel title={`Net sales by ${overTime.unit} (EGP)`} scroll={false}>
            <ColumnChart data={overTime.data} labelEvery={overTime.labelEvery} emptyMessage="No sales in this period." />
          </Panel>

          <View style={styles.columns}>
            <Panel title="Busiest hours (EGP, Cairo time)" style={styles.wide} scroll={false}>
              <ColumnChart data={hours} emptyMessage="No sales in this period." />
            </Panel>
            <View style={styles.narrow}>
              <Panel title="By channel" scroll={false}>
                <BarList
                  rows={sales.byChannel.map((entry) => ({ label: CHANNEL_LABELS[entry.channel], value: entry.netSales }))}
                  format={(value) => `${egp(value)}${share(value)}`}
                  emptyMessage="No sales yet."
                />
              </Panel>
              <Panel title="By payment method" scroll={false}>
                <BarList
                  rows={sales.byPaymentMethod.map((entry) => ({ label: PAYMENT_LABELS[entry.method], value: entry.amount }))}
                  format={(value) => `${egp(value)}${share(value)}`}
                  emptyMessage="No payments yet."
                />
              </Panel>
            </View>
          </View>

          <View style={styles.columns}>
            <Panel title="Best sellers" style={styles.half} scroll={false}>
              <DataTable columns={ITEM_COLUMNS} rows={sold.slice(0, LIST_SIZE)} rowKey={(item) => item.menuItemId} emptyMessage="Nothing sold yet." />
            </Panel>
            <Panel title="Slowest sellers" style={styles.half} scroll={false}>
              <DataTable columns={ITEM_COLUMNS} rows={slowest} rowKey={(item) => item.menuItemId} emptyMessage="No menu items yet." />
            </Panel>
          </View>
          <Text style={styles.muted}>
            Completed orders only, by business date. Item revenue includes each item&apos;s share of order discounts and refunds, so it adds
            up to net sales. Payment amounts are after refunds.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  stale: { opacity: 0.5 },
  columns: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  wide: { flex: 3 },
  narrow: { flex: 2, gap: space.md },
  half: { flex: 1 },
  muted: { fontSize: font.small, color: colors.textMuted },
});
