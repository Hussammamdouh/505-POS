import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { todayBusinessDate } from '@/lib/businessDay';
import { loadBreakEvenToday, loadStatement } from '@/lib/reports';
import { Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { compactEgp, egp, HeroFigure, KpiRow, Meter, StatTile } from '@/ui/reports/ReportKit';
import { useReport } from '@/ui/reports/useReport';
import { colors, font, space } from '@/ui/theme';

const loadToday = async () => {
  const today = todayBusinessDate();
  const [breakEven, statement] = await Promise.all([loadBreakEvenToday(), loadStatement({ from: today, to: today })]);
  return { breakEven, statement };
};

export default function TodayReportScreen() {
  const today = todayBusinessDate();
  const { data, error, loading } = useReport(loadToday, { from: today, to: today });

  if (error) {
    return <Banner tone="danger" message={error} />;
  }

  if (!data) {
    return <Text style={styles.muted}>{loading ? 'Loading today…' : 'No data.'}</Text>;
  }

  const { breakEven, statement } = data;
  const target = breakEven.breakEvenSalesRequired;
  const profit = breakEven.netMarginSoFar;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel scroll={false}>
        <View style={styles.headline}>
          <HeroFigure label={`Net sales today · ${breakEven.businessDate}`} value={`${egp(breakEven.currentNetSales)} EGP`} caption={`${statement.completedOrders} completed orders`} />
          <View style={styles.breakEven}>
            {target !== null ? (
              <>
                <Meter
                  value={breakEven.currentNetSales}
                  target={target}
                  reached={breakEven.isBreakEvenAchieved}
                  label={`Break-even target ${egp(target)} EGP`}
                />
                <Text style={[styles.verdict, breakEven.isBreakEvenAchieved ? styles.good : null]}>
                  {breakEven.isBreakEvenAchieved
                    ? '✓ Break-even reached. Every sale from here adds to profit.'
                    : `${egp(breakEven.remainingSalesToBreakEven ?? 0)} EGP more in sales to cover today's costs.`}
                </Text>
              </>
            ) : (
              <Text style={styles.muted}>
                The break-even target appears once there are sales in the last 30 days and fixed costs (rent, salaries) are set up under
                Admin → Expenses.
              </Text>
            )}
          </View>
        </View>
      </Panel>

      <KpiRow>
        <StatTile label="Today's fixed costs" value={compactEgp(breakEven.dailyFixedCostTarget)} caption="Rent, salaries and other costs spread per day" />
        <StatTile
          label="Profit after ingredients"
          value={compactEgp(breakEven.currentContributionMargin)}
          caption={breakEven.contributionMarginPercentage !== null ? `${breakEven.contributionMarginPercentage}% average margin (30 days)` : undefined}
        />
        <StatTile
          label="Profit so far today"
          value={compactEgp(profit)}
          status={{ tone: profit >= 0 ? 'good' : 'bad', text: profit >= 0 ? 'In profit' : 'Below costs' }}
        />
      </KpiRow>

      <KpiRow>
        <StatTile label="Gross sales" value={compactEgp(statement.grossSales)} />
        <StatTile label="Discounts" value={compactEgp(statement.discounts)} />
        <StatTile label="Refunds" value={compactEgp(statement.refunds)} />
        <StatTile label="Expenses recorded today" value={compactEgp(statement.directExpenses)} />
      </KpiRow>
      <Text style={styles.muted}>Amounts in EGP. Today runs from midnight, Cairo time.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  headline: { flexDirection: 'row', gap: space.xxl, alignItems: 'center', padding: space.sm },
  breakEven: { flex: 1, gap: space.md },
  verdict: { fontSize: font.large, fontWeight: '600', color: colors.text },
  good: { color: colors.success },
  muted: { fontSize: font.small, color: colors.textMuted },
});
