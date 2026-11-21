import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { loadItemProfitability, type DateRange } from '@/lib/reports';
import type { ItemProfit } from '@/lib/types';
import { Panel, Segments } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { compactEgp, DataTable, DateRangeBar, egp, KpiRow, presetRange, StatTile, type Column } from '@/ui/reports/ReportKit';
import { useReport } from '@/ui/reports/useReport';
import { colors, font, space } from '@/ui/theme';

/** Below this, an item barely covers its ingredients once rent and salaries are paid. */
const LOW_MARGIN = 50;

type Sort = 'profit' | 'margin' | 'cost';

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value)}%`);

function flag(item: ItemProfit): string {
  if (item.isOnMenu && (item.currentCost ?? 0) === 0) {
    return '⚠ No cost set';
  }

  const margin = item.marginPercentage ?? item.currentMarginPercentage;
  return margin !== null && margin < LOW_MARGIN ? '⚠ Low margin' : '';
}

const COLUMNS: Column<ItemProfit>[] = [
  { title: 'Item', render: (item) => `${item.name}${item.isOnMenu ? '' : ' (off menu)'}` },
  { title: 'Sold', width: 60, numeric: true, render: (item) => (item.freeQuantity ? `${item.quantitySold} (${item.freeQuantity} free)` : String(item.quantitySold)) },
  { title: 'Revenue', width: 95, numeric: true, render: (item) => egp(item.netRevenue) },
  { title: 'Ingredients', width: 95, numeric: true, render: (item) => egp(item.ingredientCost) },
  { title: 'Profit', width: 95, numeric: true, render: (item) => egp(item.grossProfit) },
  { title: 'Margin', width: 70, numeric: true, render: (item) => percent(item.marginPercentage) },
  {
    title: 'Menu price / cost',
    width: 140,
    numeric: true,
    render: (item) => (item.currentPrice === null ? '—' : `${egp(item.currentPrice)} / ${egp(item.currentCost ?? 0)}`),
  },
  { title: 'Menu margin', width: 95, numeric: true, render: (item) => percent(item.currentMarginPercentage) },
  { title: 'Check', width: 120, render: flag },
];

export default function ItemProfitScreen() {
  const [range, setRange] = useState<DateRange>(presetRange('last45'));
  const [sort, setSort] = useState<Sort>('profit');
  const { data: report, error, loading } = useReport(loadItemProfitability, range);

  const items = [...(report?.items ?? [])];
  if (sort === 'margin') {
    items.sort((a, b) => (a.marginPercentage ?? a.currentMarginPercentage ?? 101) - (b.marginPercentage ?? b.currentMarginPercentage ?? 101));
  } else if (sort === 'cost') {
    items.sort((a, b) => Number(!flag(a).includes('No cost')) - Number(!flag(b).includes('No cost')) || a.name.localeCompare(b.name));
  }

  const missingCost = report?.items.filter((item) => flag(item).includes('No cost')).length ?? 0;
  const lowMargin = report?.items.filter((item) => flag(item).includes('Low margin')).length ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <DateRangeBar initial="last45" onChange={setRange} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {loading && !report ? <Text style={styles.muted}>Loading…</Text> : null}
      {missingCost > 0 ? (
        <Banner
          tone="warning"
          message={`${missingCost} menu item${missingCost > 1 ? 's have' : ' has'} no ingredient cost, so their profit looks higher than it is. Set it under Admin → Menu.`}
        />
      ) : null}

      {report ? (
        <View style={[styles.content, loading && styles.stale]}>
          <KpiRow>
            <StatTile label="Item revenue" value={compactEgp(report.netRevenue)} />
            <StatTile label="Ingredient cost" value={compactEgp(report.ingredientCost)} />
            <StatTile label="Profit after ingredients" value={compactEgp(report.grossProfit)} />
            <StatTile
              label="Average margin"
              value={percent(report.marginPercentage)}
              caption={lowMargin ? `${lowMargin} item${lowMargin > 1 ? 's' : ''} below ${LOW_MARGIN}%` : undefined}
            />
          </KpiRow>

          <Panel
            title="Profit by item (EGP)"
            scroll={false}
            action={
              <Segments
                options={[
                  { value: 'profit', label: 'Most profit' },
                  { value: 'margin', label: 'Lowest margin' },
                  { value: 'cost', label: 'Missing cost' },
                ]}
                value={sort}
                onChange={setSort}
              />
            }>
            <DataTable columns={COLUMNS} rows={items} rowKey={(item) => item.menuItemId} emptyMessage="No menu items yet." />
          </Panel>
          <Text style={styles.muted}>
            Margin uses what each item really sold for (after its share of discounts and refunds) and the ingredient cost saved when it
            was sold, including options like oat milk. Menu margin uses today&apos;s price and cost. Free loyalty items add cost but no
            revenue.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  stale: { opacity: 0.5 },
  muted: { fontSize: font.small, color: colors.textMuted },
});
