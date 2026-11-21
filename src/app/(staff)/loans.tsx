import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiRequest, describeError, NetworkError } from '@/lib/api';
import { formatReceiptTime, todayBusinessDate } from '@/lib/businessDay';
import { monthRange, shiftMonth } from '@/lib/months';
import type { StaffLoanMonth } from '@/lib/types';
import { useApp } from '@/store/app';
import { EmptyState, Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { egp } from '@/ui/reports/ReportKit';
import { StaffLoanDialog } from '@/ui/shift/StaffLoanDialog';
import { colors, font, space } from '@/ui/theme';

const loadLoans = (month: string) => apiRequest<StaffLoanMonth>('GET', `/api/v1/shifts/staff-loans?month=${month}`);

/** "Loan: Sara (rent)" is stored as the cash move's reason; the screen shows just the note. */
const noteOf = (reason: string) => /\((.*)\)$/.exec(reason)?.[1] ?? null;

// Loans: cash a staff member takes from the drawer, deducted from that month's salary. Open to every staff member.
export default function LoansScreen() {
  const thisMonth = todayBusinessDate().slice(0, 7);
  const drawerOpen = useApp((state) => state.shift !== null);
  const offline = useApp((state) => state.connectivity === 'offline');
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<StaffLoanMonth | null>(null);
  // Which month the error belongs to, so moving to another month clears it.
  const [failure, setFailure] = useState<{ month: string; message: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadLoans(month)
      .then((loaded) => active && setData(loaded))
      .catch(
        (loadError) =>
          active && setFailure({ month, message: loadError instanceof NetworkError ? 'Loans need the internet.' : describeError(loadError) }),
      );
    return () => {
      active = false;
    };
  }, [month, version]);

  const shown = data?.month === month ? data : null;
  const error = failure?.month === month && !shown ? failure.message : null;
  const byPerson = new Map<string, { name: string; total: number; count: number }>();
  shown?.loans.forEach((loan) => {
    const entry = byPerson.get(loan.staffId) ?? { name: loan.staffName, total: 0, count: 0 };
    byPerson.set(loan.staffId, { ...entry, total: entry.total + loan.amount, count: entry.count + 1 });
  });
  const people = [...byPerson.values()].sort((a, b) => b.total - a.total);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.bar}>
        <Button label="‹" variant="secondary" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Text style={styles.month}>{monthRange(month).label}</Text>
        <Button label="›" variant="secondary" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} />
        {month !== thisMonth ? <Button label="This month" variant="ghost" onPress={() => setMonth(thisMonth)} /> : null}
        <View style={styles.grow} />
        <Button label="Record a loan" onPress={() => setRecording(true)} disabled={!drawerOpen || offline} large />
      </View>
      {!drawerOpen ? <Banner tone="warning" message="Loans come out of the drawer, so a shift must be open. Start one on the Shift tab." /> : null}
      {notice ? <Banner tone="success" message={notice} /> : null}
      {error ? <Banner tone="danger" message={error} /> : null}

      {shown ? (
        <View style={styles.columns}>
          <Panel title={`Loans (${shown.loans.length})`} style={styles.list} scroll={false}>
            {shown.loans.length === 0 ? <EmptyState message="No loans this month." /> : null}
            {shown.loans.map((loan) => {
              const note = noteOf(loan.reason);
              return (
                <View key={loan.id} style={styles.row}>
                  <Text style={styles.when}>{formatReceiptTime(loan.createdAt)}</Text>
                  <View style={styles.grow}>
                    <Text style={styles.name}>{loan.staffName}</Text>
                    <Text style={styles.meta} numberOfLines={2}>
                      Recorded by {loan.recordedByName}
                      {note ? ` · ${note}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{egp(loan.amount)}</Text>
                </View>
              );
            })}
          </Panel>

          <Panel title="By person" style={styles.side} scroll={false}>
            {people.length === 0 ? <EmptyState message="Nobody has taken a loan." /> : null}
            {people.map((person) => (
              <View key={person.name} style={styles.row}>
                <Text style={[styles.name, styles.grow]}>{person.name}</Text>
                <Text style={styles.meta}>{person.count}×</Text>
                <Text style={styles.amount}>{egp(person.total)}</Text>
              </View>
            ))}
            <View style={[styles.row, styles.totalRow]}>
              <Text style={[styles.name, styles.grow]}>Total</Text>
              <Text style={styles.amount}>{egp(shown.total)} EGP</Text>
            </View>
            <Text style={styles.meta}>Each loan comes off the borrower&apos;s salary for this month.</Text>
          </Panel>
        </View>
      ) : !error ? (
        <Text style={styles.meta}>Loading…</Text>
      ) : null}

      {recording ? (
        <StaffLoanDialog
          expectedCash={null}
          onClose={() => setRecording(false)}
          onRecorded={(message) => {
            setRecording(false);
            setNotice(message);
            setMonth(thisMonth);
            setVersion((current) => current + 1);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  month: { fontSize: font.title, fontWeight: '700', color: colors.text, minWidth: 180, textAlign: 'center' },
  grow: { flex: 1 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'flex-start' },
  list: { flexGrow: 3, flexBasis: 420 },
  side: { flexGrow: 2, flexBasis: 280 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalRow: { borderBottomWidth: 0 },
  when: { width: 130, fontSize: font.small, color: colors.textMuted },
  name: { fontSize: font.body, fontWeight: '600', color: colors.text },
  meta: { fontSize: font.small, color: colors.textMuted },
  amount: { fontSize: font.body, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
