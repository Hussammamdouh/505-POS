import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { loadStatement, type DateRange } from '@/lib/reports';
import { Panel } from '@/ui/admin/AdminKit';
import { EXPENSE_CATEGORY_LABELS } from '@/ui/admin/labels';
import { Banner } from '@/ui/Banner';
import { BarList, compactEgp, DateRangeBar, KpiRow, presetRange, StatementTable, StatTile } from '@/ui/reports/ReportKit';
import { useReport } from '@/ui/reports/useReport';
import { colors, font, space } from '@/ui/theme';

export default function ProfitReportScreen() {
  const [range, setRange] = useState<DateRange>(presetRange('month'));
  const { data: statement, error, loading } = useReport(loadStatement, range);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <DateRangeBar initial="month" onChange={setRange} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {loading && !statement ? <Text style={styles.muted}>Loading…</Text> : null}

      {statement ? (
        <View style={[styles.content, loading && styles.stale]}>
          <KpiRow>
            <StatTile label="Net sales" value={compactEgp(statement.netSales)} caption={`${statement.completedOrders} orders`} />
            <StatTile label="Gross profit" value={compactEgp(statement.grossProfit)} caption={`${statement.grossMarginPercentage}% after ingredients`} />
            <StatTile label="Operating costs" value={compactEgp(statement.totalOpex)} />
            <StatTile
              label="Net profit"
              value={compactEgp(statement.netOperatingProfit)}
              caption={`${statement.netProfitMarginPercentage}% of net sales`}
              status={{
                tone: statement.netOperatingProfit >= 0 ? 'good' : 'bad',
                text: statement.netOperatingProfit >= 0 ? 'Profit' : 'Loss',
              }}
            />
          </KpiRow>

          <View style={styles.columns}>
            <Panel title="Profit & loss statement (EGP)" style={styles.statement} scroll={false}>
              <StatementTable
                lines={[
                  { label: 'Gross sales', amount: statement.grossSales },
                  { label: 'Discounts', amount: statement.discounts, kind: 'subtract' },
                  { label: 'Refunds', amount: statement.refunds, kind: 'subtract' },
                  { label: 'Net sales', amount: statement.netSales, kind: 'total' },
                  { label: 'Ingredient cost', amount: statement.totalCogs, kind: 'subtract', note: 'from item costs set in the menu' },
                  { label: 'Gross profit', amount: statement.grossProfit, kind: 'total' },
                  { label: 'Expenses recorded', amount: statement.directExpenses, kind: 'subtract' },
                  { label: 'Fixed costs for the period', amount: statement.amortizedOverheads, kind: 'subtract', note: 'rent, salaries…' },
                  { label: 'Net operating profit', amount: statement.netOperatingProfit, kind: 'total' },
                ]}
              />
            </Panel>
            <Panel title="Operating costs by category (EGP)" style={styles.breakdown} scroll={false}>
              <BarList
                rows={statement.opexByCategory.map((entry) => ({ label: EXPENSE_CATEGORY_LABELS[entry.category], value: entry.amount }))}
                emptyMessage="No expenses or fixed costs in this period."
              />
            </Panel>
          </View>
          <Text style={styles.muted}>
            Sales count completed orders by business date. Ingredient cost uses the cost saved on each order when it was sold. Fixed
            costs are spread evenly over each day they apply.
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
  statement: { flex: 3 },
  breakdown: { flex: 2 },
  muted: { fontSize: font.small, color: colors.textMuted },
});
