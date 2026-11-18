import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { formatReceiptTime, todayBusinessDate } from '@/lib/businessDay';
import { monthRange, shiftMonth } from '@/lib/months';
import { loadStaffMonth } from '@/lib/reports';
import { formatDays } from '@/lib/schedule';
import type { StaffMonth, StaffMonthRow } from '@/lib/types';
import { Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { DataTable, egp, type Column } from '@/ui/reports/ReportKit';
import { colors, font, radius, space } from '@/ui/theme';

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** A business date ("2026-11-03") as "Tue 3 Nov". */
const day = (date: string) => WEEKDAY.format(new Date(`${date}T00:00:00Z`)).replace(',', '');

const money = (amount: number | null) => (amount === null ? '—' : egp(amount));

const COLUMNS: Column<StaffMonthRow>[] = [
  { title: 'Staff', render: (row) => `${row.fullName}${row.isActive ? '' : ' (inactive)'}` },
  { title: 'Days in', width: 64, numeric: true, render: (row) => String(row.daysAttended) },
  { title: 'Late', width: 48, numeric: true, render: (row) => (row.lateCount ? String(row.lateCount) : '—') },
  { title: 'No-show', width: 70, numeric: true, render: (row) => (row.noShowCount ? String(row.noShowCount) : '—') },
  {
    title: 'Penalties',
    width: 120,
    numeric: true,
    render: (row) => (row.penaltyDays ? `${formatDays(row.penaltyDays)}${row.penaltyAmount !== null ? ` · ${egp(row.penaltyAmount)}` : ''}` : '—'),
  },
  { title: 'Loans', width: 86, numeric: true, render: (row) => (row.loansTotal ? egp(row.loansTotal) : '—') },
  { title: 'Salary', width: 92, numeric: true, render: (row) => money(row.expectedSalary) },
  { title: 'To pay', width: 92, numeric: true, render: (row) => money(row.actualSalary) },
];

// Reports → Staff: one month per person. Attendance is checked against the schedule; "To pay" is the salary
// minus penalties (from the Penalties tab) minus loans taken from the drawer that month.
export default function StaffReportScreen() {
  const thisMonth = todayBusinessDate().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<StaffMonth | null>(null);
  // Which month the error belongs to, so moving to another month clears it.
  const [error, setError] = useState<{ month: string; message: string } | null>(null);
  const range = monthRange(month);

  useEffect(() => {
    let active = true;
    loadStaffMonth(month)
      .then((loaded) => active && setData(loaded))
      .catch(
        (loadError) =>
          active && setError({ month, message: loadError instanceof NetworkError ? 'Reports need the internet.' : describeError(loadError) }),
      );
    return () => {
      active = false;
    };
  }, [month]);

  const shown = data?.month === month ? data : null;
  const errorMessage = error?.month === month ? error.message : null;
  const loading = !shown && !errorMessage;
  const withDetails = shown?.staff.filter((row) => row.lateShifts.length + row.noShows.length + row.loans.length > 0) ?? [];
  const totalToPay = shown?.staff.reduce((sum, row) => sum + (row.actualSalary ?? 0), 0) ?? 0;
  const totalLoans = shown?.staff.reduce((sum, row) => sum + row.loansTotal, 0) ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.monthBar}>
        <Button label="‹" variant="secondary" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Text style={styles.month}>{range.label}</Text>
        <Button label="›" variant="secondary" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} />
        {month !== thisMonth ? <Button label="This month" variant="ghost" onPress={() => setMonth(thisMonth)} /> : null}
      </View>
      {errorMessage ? <Banner tone="danger" message={errorMessage} /> : null}
      {loading ? <Text style={styles.muted}>Loading…</Text> : null}

      {shown ? (
        <View style={styles.content}>
          {month === thisMonth ? (
            <Banner tone="info" message="This month is still running: attendance counts days so far, and the amounts to pay can still change." />
          ) : !shown.penaltiesLocked ? (
            <Banner tone="warning" message="Penalties for this month aren't locked yet, so the amounts to pay can still change. Lock the month in Penalties once salaries are paid." />
          ) : null}

          <Panel title="By staff member (EGP)" scroll={false}>
            <DataTable columns={COLUMNS} rows={shown.staff} rowKey={(row) => row.staffId} emptyMessage="No staff this month." />
            <View style={styles.totals}>
              <Text style={styles.total}>Loans this month: {egp(totalLoans)} EGP</Text>
              <Text style={styles.total}>Total to pay: {egp(totalToPay)} EGP</Text>
            </View>
          </Panel>

          {withDetails.length > 0 ? (
            <Panel title="Late days, no-shows and loans" scroll={false}>
              <View style={styles.people}>
                {withDetails.map((row) => (
                  <PersonDetails key={row.staffId} row={row} />
                ))}
              </View>
            </Panel>
          ) : null}

          <Text style={styles.muted}>
            Days in = days with a clock-in. Late and no-show come from the schedule (late means past the grace minutes). Salary is the
            month&apos;s salary (split if it changed during the month); To pay = Salary − penalties − loans. People without a salary set show
            —. A loan comes off the salary of the month it was taken, or the next month if that month was already locked as paid.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function PersonDetails({ row }: { row: StaffMonthRow }) {
  return (
    <View style={styles.person}>
      <Text style={styles.personName}>{row.fullName}</Text>
      {row.lateShifts.length > 0 ? (
        <Text style={styles.line}>
          <Text style={styles.label}>Late: </Text>
          {row.lateShifts
            .map((shift) => `${day(shift.date)} (${shift.lateMinutes} min${shift.waived ? ', waived' : ''})`)
            .join(' · ')}
        </Text>
      ) : null}
      {row.noShows.length > 0 ? (
        <Text style={styles.line}>
          <Text style={styles.label}>No-show: </Text>
          {row.noShows.map((shift) => `${day(shift.date)} ${shift.shiftName}${shift.waived ? ' (waived)' : ''}`).join(' · ')}
        </Text>
      ) : null}
      {row.loans.map((loan) => (
        <Text key={loan.id} style={styles.line}>
          <Text style={styles.label}>Loan: </Text>
          {egp(loan.amount)} EGP · {formatReceiptTime(loan.createdAt)} · recorded by {loan.recordedByName}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  muted: { fontSize: font.small, color: colors.textMuted },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  month: { minWidth: 190, textAlign: 'center', fontSize: font.title, fontWeight: '800', color: colors.text },
  totals: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.xl, paddingTop: space.sm },
  total: { fontSize: font.body, fontWeight: '700', color: colors.text },
  people: { gap: space.sm },
  person: { gap: 2, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  personName: { fontSize: font.body, fontWeight: '700', color: colors.text },
  line: { fontSize: font.small, color: colors.text },
  label: { fontWeight: '700', color: colors.textMuted },
});
