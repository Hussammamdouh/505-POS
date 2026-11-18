import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { loadCashFlow, type DateRange } from '@/lib/reports';
import { Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { compactEgp, DateRangeBar, KpiRow, presetRange, StatementTable, StatTile } from '@/ui/reports/ReportKit';
import { useReport } from '@/ui/reports/useReport';
import { colors, font, space } from '@/ui/theme';

export default function CashFlowReportScreen() {
  const [range, setRange] = useState<DateRange>(presetRange('month'));
  const { data: flow, error, loading } = useReport(loadCashFlow, range);

  // Payouts are the drawer-cash expenses; drawer refunds and drops also leave the drawer.
  const drawerOut = flow ? flow.drawerCashRefunded + flow.cashExpensesPaid + flow.cashDrops + flow.staffLoans : 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <DateRangeBar initial="month" onChange={setRange} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {loading && !flow ? <Text style={styles.muted}>Loading…</Text> : null}

      {flow ? (
        <View style={[styles.content, loading && styles.stale]}>
          <KpiRow>
            <StatTile label="Money in" value={compactEgp(flow.totalCashIn)} />
            <StatTile label="Money out" value={compactEgp(flow.totalCashOut)} />
            <StatTile
              label="Net change"
              value={compactEgp(flow.netCashChange)}
              status={{ tone: flow.netCashChange >= 0 ? 'good' : 'bad', text: flow.netCashChange >= 0 ? 'More came in' : 'More went out' }}
            />
          </KpiRow>

          <View style={styles.columns}>
            <Panel title="Where money came from (EGP)" style={styles.column} scroll={false}>
              <StatementTable
                lines={[
                  { label: 'Cash into the drawer', amount: flow.drawerCashCollected, note: 'cash + website cash' },
                  { label: 'Card & wallets', amount: flow.digitalPaymentsCollected, note: 'Visa, InstaPay, Vodafone Cash' },
                  { label: 'Talabat', amount: flow.talabatPaymentsCollected },
                  { label: 'Total in', amount: flow.totalCashIn, kind: 'total' },
                ]}
              />
            </Panel>
            <Panel title="Where money went (EGP)" style={styles.column} scroll={false}>
              <StatementTable
                lines={[
                  { label: 'Refunds paid back', amount: flow.refundsPaid },
                  { label: 'Payouts from the drawer', amount: flow.cashExpensesPaid },
                  { label: "Paid from owner's cash", amount: flow.ownerCashExpensesPaid },
                  { label: 'Bank transfer & company card', amount: flow.nonCashExpensesPaid },
                  { label: 'Staff salaries', amount: flow.salariesPaid, note: 'counted automatically' },
                  { label: 'Paid to suppliers for stock', amount: flow.supplierPaymentsPaid, note: 'not an expense in P&L' },
                  { label: 'Total out', amount: flow.totalCashOut, kind: 'total' },
                ]}
              />
            </Panel>
          </View>

          <Panel title="The cash drawer (EGP)" scroll={false}>
            <StatementTable
              lines={[
                { label: 'Cash taken', amount: flow.drawerCashCollected },
                { label: 'Cash refunds', amount: flow.drawerCashRefunded, kind: 'subtract' },
                { label: 'Payouts', amount: flow.cashExpensesPaid, kind: 'subtract' },
                { label: 'Cash drops (moved out of the drawer)', amount: flow.cashDrops, kind: 'subtract' },
                { label: 'Staff loans (taken off their salary)', amount: flow.staffLoans, kind: 'subtract' },
                { label: 'Change in drawer cash', amount: flow.netDrawerCashChange, kind: 'total' },
              ]}
            />
            <Text style={styles.muted}>
              {compactEgp(drawerOut)} EGP left the drawer in this period. Cash drops are not spending: they are cash moved to the owner,
              so they count here but not in money out. Staff loans are part of salaries (already counted in money out).
            </Text>
          </Panel>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  stale: { opacity: 0.5 },
  columns: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  column: { flex: 1 },
  muted: { fontSize: font.small, color: colors.textMuted },
});
