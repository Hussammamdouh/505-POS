import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiRequest, describeError, NetworkError } from '@/lib/api';
import { formatClock } from '@/lib/businessDay';
import { formatEgp, parseMoneyInput, toPiastres } from '@/lib/money';
import { refreshShift } from '@/lib/shift';
import type { CurrentShift, SalesBreakdown, ShiftTotals } from '@/lib/types';
import { canManage, useApp } from '@/store/app';
import { Segments } from '@/ui/admin/AdminKit';
import { EXPENSE_CATEGORY_LABELS } from '@/ui/admin/labels';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { ShiftHistory } from '@/ui/ShiftHistory';
import { CashCounter, countTotal, type CashCount } from '@/ui/shift/CashCounter';
import { CashMoveDialog, MOVEMENT_LABELS, type DrawerMoveType } from '@/ui/shift/CashMoveDialog';
import { EndShiftDialog } from '@/ui/shift/EndShiftDialog';
import { StaffLoanDialog } from '@/ui/shift/StaffLoanDialog';
import { colors, font, radius, space } from '@/ui/theme';

type Feedback = { tone: 'success' | 'danger' | 'warning'; message: string } | null;
type Dialog = { kind: 'move'; type: DrawerMoveType } | { kind: 'loan' } | { kind: 'end' } | null;

const METHOD_ROWS: { label: string; key: keyof Omit<ShiftTotals, 'totalCashDrops' | 'totalPettyPayouts' | 'totalStaffLoans' | 'expectedCash' | 'allMethods' | 'talabat'> }[] = [
  { label: 'Cash', key: 'cash' },
  { label: 'Visa', key: 'visa' },
  { label: 'InstaPay', key: 'instapay' },
  { label: 'Vodafone Cash', key: 'vodafoneCash' },
  { label: 'Talabat Cash', key: 'talabatCash' },
  { label: 'Talabat Visa', key: 'talabatVisa' },
];

const egp = (amount: number) => formatEgp(toPiastres(amount));

export default function ShiftScreen() {
  const session = useApp((state) => state.session);
  const connectivity = useApp((state) => state.connectivity);
  const unsyncedCount = useApp((state) => state.unsyncedCount);
  const [shift, setShift] = useState<CurrentShift | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const manager = canManage(session);
  const offline = connectivity === 'offline' || !session?.token;

  const load = useCallback(async () => {
    try {
      setShift(await refreshShift());
    } catch (error) {
      setFeedback({ tone: 'warning', message: error instanceof NetworkError ? 'Shift details need the internet.' : describeError(error) });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    refreshShift()
      .then((current) => active && setShift(current))
      .catch((error) => {
        if (active) {
          setFeedback({ tone: 'warning', message: error instanceof NetworkError ? 'Shift details need the internet.' : describeError(error) });
        }
      })
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  const afterMove = (message: string) => {
    setDialog(null);
    setFeedback({ tone: 'success', message });
    void load();
  };

  const afterClose = () => {
    setDialog(null);
    setShift(null);
    setFeedback({ tone: 'success', message: 'Shift closed. Start a new shift when the next person counts the drawer.' });
    setHistoryVersion((version) => version + 1);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {offline ? <Banner tone="warning" message="Starting, ending and cash moves need the internet. Sales can continue offline." /> : null}
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      {!loaded ? null : shift ? (
        <>
          <View style={[styles.card, styles.header]}>
            <View style={styles.headerMain}>
              <View style={styles.pill}>
                <View style={styles.dot} />
                <Text style={styles.pillText}>Drawer open</Text>
              </View>
              <Text style={styles.title}>Opened by {shift.staffName}</Text>
              <Text style={styles.meta}>
                Since {formatClock(shift.openedAt)} · Opening float {egp(shift.openingFloat)}
              </Text>
            </View>
            {shift.totals ? (
              <View style={styles.expected}>
                <Text style={styles.expectedLabel}>Expected in drawer</Text>
                <Text style={styles.expectedValue}>{egp(shift.totals.expectedCash)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.columns}>
            <View style={[styles.card, styles.salesColumn]}>
              <Text style={styles.cardTitle}>Sales this shift</Text>
              {shift.totals ? (
                <>
                  {METHOD_ROWS.map(({ label, key }) => (
                    <MethodRow key={key} label={label} value={shift.totals![key]} />
                  ))}
                  <View style={styles.divider} />
                  <MethodRow label="Total" value={shift.totals.allMethods} bold />
                  <View style={styles.divider} />
                  <Text style={styles.subTitle}>Drawer cash</Text>
                  <AmountRow label="Opening float" amount={shift.openingFloat} />
                  <AmountRow label="Cash sales (after refunds)" amount={shift.totals.cash.net} sign="+" />
                  <AmountRow label="Payouts" amount={shift.totals.totalPettyPayouts} sign="−" />
                  <AmountRow label="Cash drops" amount={shift.totals.totalCashDrops} sign="−" />
                  {shift.totals.totalStaffLoans > 0 ? <AmountRow label="Staff loans" amount={shift.totals.totalStaffLoans} sign="−" /> : null}
                  <AmountRow label="Expected in drawer" amount={shift.totals.expectedCash} bold />
                </>
              ) : (
                <Text style={styles.meta}>Sales totals are visible to managers. Count the drawer when you end the shift.</Text>
              )}
            </View>

            <View style={styles.sideColumn}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Drawer actions</Text>
                <Button label="Payout" onPress={() => setDialog({ kind: 'move', type: 'PETTY_PAYOUT' })} disabled={offline} large />
                <Button label="Staff loan" variant="secondary" onPress={() => setDialog({ kind: 'loan' })} disabled={offline} large />
                {manager ? (
                  <Button label="Cash drop" variant="secondary" onPress={() => setDialog({ kind: 'move', type: 'CASH_DROP' })} disabled={offline} large />
                ) : null}
                <Button label="End shift" variant="danger" onPress={() => setDialog({ kind: 'end' })} disabled={offline} large />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Cash moves</Text>
                {shift.cashMovements.length === 0 ? <Text style={styles.meta}>No payouts, drops or loans yet.</Text> : null}
                {shift.cashMovements.map((movement) => (
                  <View key={movement.id} style={styles.moveRow}>
                    <Text style={styles.moveTime}>{formatClock(movement.createdAt)}</Text>
                    <View style={styles.moveMain}>
                      <Text style={styles.moveTitle} numberOfLines={1}>
                        {MOVEMENT_LABELS[movement.movementType]} · {movement.reason}
                      </Text>
                      <Text style={styles.moveMeta} numberOfLines={1}>
                        {movement.expenseCategory ? `${EXPENSE_CATEGORY_LABELS[movement.expenseCategory]} · ` : ''}
                        by {movement.authorizedByName}
                      </Text>
                    </View>
                    <Text style={styles.moveAmount}>−{egp(movement.amount)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </>
      ) : (
        <StartShift offline={offline} onStarted={async () => {
          setFeedback({ tone: 'success', message: 'Shift started.' });
          await load();
        }} />
      )}

      {manager && !offline ? <ShiftHistory key={historyVersion} /> : null}

      {dialog?.kind === 'move' && shift ? (
        <CashMoveDialog
          type={dialog.type}
          needsManagerPin={!manager}
          expectedCash={shift.totals?.expectedCash ?? null}
          onClose={() => setDialog(null)}
          onRecorded={afterMove}
        />
      ) : null}
      {dialog?.kind === 'loan' && shift ? (
        <StaffLoanDialog expectedCash={shift.totals?.expectedCash ?? null} onClose={() => setDialog(null)} onRecorded={afterMove} />
      ) : null}
      {dialog?.kind === 'end' && shift ? (
        <EndShiftDialog shift={shift} unsyncedCount={unsyncedCount} onRecheck={load} onClose={() => setDialog(null)} onClosed={afterClose} />
      ) : null}
    </ScrollView>
  );
}

function StartShift({ offline, onStarted }: { offline: boolean; onStarted: () => Promise<void> }) {
  const [mode, setMode] = useState<'total' | 'count'>('total');
  const [total, setTotal] = useState('');
  const [count, setCount] = useState<CashCount>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const amount = mode === 'count' ? countTotal(count) : parseMoneyInput(total);
    if (amount === null) {
      setError('Enter the cash in the drawer, e.g. 500.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest('POST', '/api/v1/shifts/open', { body: { openingFloat: amount / 100 } });
      await onStarted();
    } catch (startError) {
      setError(startError instanceof NetworkError ? 'Starting a shift needs the internet.' : describeError(startError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, styles.start]}>
      <View style={[styles.pill, styles.pillClosed]}>
        <View style={[styles.dot, styles.dotClosed]} />
        <Text style={[styles.pillText, styles.pillTextClosed]}>Drawer closed</Text>
      </View>
      <Text style={styles.title}>Start a shift</Text>
      <Text style={styles.meta}>Count the cash in the drawer. This is the opening float.</Text>
      <Segments
        options={[
          { value: 'total', label: 'Type the total' },
          { value: 'count', label: 'Count notes' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'total' ? (
        <Field label="Opening float" value={total} onChangeText={setTotal} keyboardType="decimal-pad" />
      ) : (
        <CashCounter count={count} onChange={setCount} />
      )}
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button label="Start shift" onPress={() => void start()} busy={busy} disabled={offline} large />
    </View>
  );
}

function MethodRow({ label, value, bold }: { label: string; value: SalesBreakdown; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, bold && styles.bold]}>{egp(value.net)}</Text>
        {value.refunds > 0 ? <Text style={styles.refunds}>refunds {egp(value.refunds)}</Text> : null}
      </View>
    </View>
  );
}

function AmountRow({ label, amount, sign, bold }: { label: string; amount: number; sign?: '+' | '−'; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold, bold && { color: colors.primary }]}>
        {sign && amount > 0 ? `${sign} ` : ''}
        {egp(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.lg },
  headerMain: { gap: space.xs, flexShrink: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
  },
  pillClosed: { backgroundColor: colors.surfaceMuted },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  dotClosed: { backgroundColor: colors.textMuted },
  pillText: { fontSize: font.small, fontWeight: '700', color: colors.success },
  pillTextClosed: { color: colors.textMuted },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.body, color: colors.textMuted },
  expected: { alignItems: 'flex-end' },
  expectedLabel: { fontSize: font.body, color: colors.textMuted },
  expectedValue: { fontSize: font.hero, fontWeight: '700', color: colors.primary },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'flex-start' },
  salesColumn: { flexGrow: 3, flexBasis: 360, gap: space.sm },
  sideColumn: { flexGrow: 2, flexBasis: 300, gap: space.md },
  cardTitle: { fontSize: font.large, fontWeight: '700', color: colors.text },
  subTitle: { fontSize: font.body, fontWeight: '700', color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  rowRight: { alignItems: 'flex-end' },
  rowLabel: { fontSize: font.body, color: colors.text },
  rowValue: { fontSize: font.body, color: colors.text },
  refunds: { fontSize: font.small, color: colors.danger },
  bold: { fontWeight: '700' },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  moveTime: { width: 52, fontSize: font.small, color: colors.textMuted },
  moveMain: { flex: 1, gap: 2 },
  moveTitle: { fontSize: font.body, fontWeight: '600', color: colors.text },
  moveMeta: { fontSize: font.small, color: colors.textMuted },
  moveAmount: { fontSize: font.body, fontWeight: '700', color: colors.danger },
  start: { maxWidth: 680, width: '100%', alignSelf: 'center' },
});
