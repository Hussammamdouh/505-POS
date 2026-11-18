import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { isBusinessDate, todayBusinessDate } from '@/lib/businessDay';
import {
  addPenalty,
  formatDays,
  loadPenalties,
  lockPenaltyMonth,
  unlockPenaltyMonth,
  PENALTY_LABELS,
  removePenalty,
  waivePenalty,
  type PenaltyItem,
  type PenaltyLedger,
} from '@/lib/schedule';
import { formatEgp, toPiastres } from '@/lib/money';
import { monthRange, shiftMonth } from '@/lib/months';
import { canManage, isAdmin, useApp } from '@/store/app';
import { EmptyState, ListRow, Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { DaysPicker } from '@/ui/DaysPicker';
import { Field } from '@/ui/Field';
import { colors, font, radius, space } from '@/ui/theme';

const errorMessage = (error: unknown) => (error instanceof NetworkError ? 'This needs the internet.' : describeError(error));

// Each person's penalties for a period: automatic ones from the schedule (late, early, no-show) and
// ones a manager gave by hand, with why. Managers add, waive or remove them here.
export default function PenaltiesScreen() {
  const session = useApp((state) => state.session);
  // Penalties are settled month by month with salaries.
  const thisMonth = todayBusinessDate().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const range = monthRange(month);
  const [ledger, setLedger] = useState<PenaltyLedger | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [confirmLock, setConfirmLock] = useState(false);

  useEffect(() => {
    let active = true;
    loadPenalties(month)
      .then((loaded) => active && (setLedger(loaded), setError(null)))
      .catch((loadError) => active && setError(errorMessage(loadError)));
    return () => {
      active = false;
    };
  }, [month, reload]);

  if (!canManage(session)) {
    return <Redirect href="/register" />;
  }

  const refresh = () => setReload((value) => value + 1);
  const selected = ledger?.staff.find((person) => person.staffId === selectedId) ?? ledger?.staff[0] ?? null;
  const items = ledger?.items.filter((item) => item.staffId === selected?.staffId) ?? [];
  const totalDays = ledger?.staff.reduce((sum, person) => sum + person.days, 0) ?? 0;
  const locked = ledger?.month === month && ledger.locked;

  const toggleLock = async () => {
    try {
      setLedger(await (locked ? unlockPenaltyMonth(month) : lockPenaltyMonth(month)));
      setConfirmLock(false);
      setError(null);
    } catch (lockError) {
      setError(errorMessage(lockError));
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <View style={styles.monthBar}>
          <Button label="‹" variant="secondary" onPress={() => setMonth(shiftMonth(month, -1))} />
          <Text style={styles.month}>{range.label}</Text>
          <Button label="›" variant="secondary" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} />
          {month !== thisMonth ? <Button label="This month" variant="ghost" onPress={() => setMonth(thisMonth)} /> : null}
          <Text style={styles.total}>
            All staff: {totalDays > 0 ? formatDays(totalDays) : 'no penalties'}
            {ledger && ledger.totalAmount > 0 ? ` · ${formatEgp(toPiastres(ledger.totalAmount))}` : ''}
          </Text>
          {ledger && !locked ? (
            confirmLock ? (
              <>
                <Button label="Cancel" variant="ghost" onPress={() => setConfirmLock(false)} />
                <Button label="Yes, salaries are paid" variant="danger" onPress={() => void toggleLock()} />
              </>
            ) : (
              <Button label="Lock month (paid)" variant="secondary" onPress={() => setConfirmLock(true)} />
            )
          ) : null}
          {locked && isAdmin(session) ? <Button label="Unlock" variant="ghost" onPress={() => void toggleLock()} /> : null}
        </View>
      </View>
      {confirmLock ? (
        <Banner tone="warning" message={`Lock ${range.label}? Its penalties will be frozen as they are now. Rule changes, waivers and new penalties won't change it.`} />
      ) : null}
      {locked ? (
        <Banner
          tone="info"
          message={`${range.label} is locked: salaries were paid. Locked by ${ledger?.lockedByName ?? 'a manager'}${ledger?.lockedAt ? ` on ${ledger.lockedAt.slice(0, 10)}` : ''}. This is the record as it was then.`}
        />
      ) : null}
      {error ? <Banner tone="danger" message={error} /> : null}

      <View style={styles.columns}>
        <Panel title="Staff" style={styles.list}>
          {ledger && ledger.staff.length === 0 ? <EmptyState message="No staff yet." /> : null}
          {ledger?.staff.map((person) => (
            <ListRow
              key={person.staffId}
              title={person.staffName}
              subtitle={person.count ? `${person.count} penalt${person.count === 1 ? 'y' : 'ies'}${person.waivedDays ? ` · ${formatDays(person.waivedDays)} waived` : ''}` : 'No penalties'}
              badge={person.days > 0 ? (person.amount != null ? `${formatDays(person.days)} · ${formatEgp(toPiastres(person.amount))}` : formatDays(person.days)) : null}
              badgeTone={person.days > 0 ? 'danger' : 'muted'}
              selected={person.staffId === selected?.staffId}
              onPress={() => setSelectedId(person.staffId)}
            />
          ))}
        </Panel>

        {selected ? (
          <ScrollView style={styles.detail} contentContainerStyle={styles.detailContent}>
            <View style={styles.header}>
              <Text style={styles.name}>{selected.staffName}</Text>
              <Text style={[styles.days, selected.days > 0 && styles.daysBad]}>
                {selected.days > 0
                  ? `${formatDays(selected.days)}${selected.amount != null ? ` = ${formatEgp(toPiastres(selected.amount))}` : ''} to deduct`
                  : 'Nothing to deduct'}
              </Text>
            </View>
            <Text style={styles.rate}>
              {selected.dailyRate != null
                ? `A day's pay: ${formatEgp(toPiastres(selected.dailyRate))}`
                : 'No salary set, so only days are shown. Add the salary in Admin → Staff.'}
            </Text>

            {locked ? null : <AddPenaltyForm key={selected.staffId} staffId={selected.staffId} staffName={selected.staffName} onAdded={refresh} />}

            <Panel title={`Penalties in ${range.label}`} scroll={false}>
              {items.length === 0 ? <EmptyState message={`No penalties in ${range.label}.`} /> : null}
              {items.map((item, index) => (
                <PenaltyRow key={item.id ?? `${item.date}-${item.kind}-${index}`} item={item} locked={locked} onChanged={refresh} />
              ))}
            </Panel>
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function AddPenaltyForm({ staffId, staffName, onAdded }: { staffId: string; staffName: string; onAdded: () => void }) {
  const [date, setDate] = useState(todayBusinessDate());
  const [days, setDays] = useState(0.5);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  const save = async () => {
    if (!isBusinessDate(date)) {
      return setFeedback({ tone: 'danger', message: 'The date must look like 2026-10-31.' });
    }

    if (!reason.trim()) {
      return setFeedback({ tone: 'danger', message: 'Write why, e.g. "rude to a customer".' });
    }

    setBusy(true);
    setFeedback(null);
    try {
      await addPenalty({ staffId, date: date.trim(), days, reason: reason.trim() });
      setReason('');
      setFeedback({ tone: 'success', message: `${formatDays(days)} penalty added for ${staffName}.` });
      onAdded();
    } catch (saveError) {
      setFeedback({ tone: 'danger', message: errorMessage(saveError) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={`Add a penalty for ${staffName}`} scroll={false}>
      <View style={styles.form}>
        <DaysPicker label="How many days" value={days} onChange={setDays} />
        <View style={styles.formRow}>
          <View style={styles.dateField}>
            <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCorrect={false} />
          </View>
          <View style={styles.grow}>
            <Field label="Why" value={reason} onChangeText={setReason} placeholder="e.g. used the phone at the bar during service" />
          </View>
        </View>
        {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
        <View style={styles.actions}>
          <Button label={`Add ${formatDays(days)} penalty`} variant="danger" onPress={() => void save()} busy={busy} />
        </View>
      </View>
    </Panel>
  );
}

function PenaltyRow({ item, locked, onChanged }: { item: PenaltyItem; locked: boolean; onChanged: () => void }) {
  const [mode, setMode] = useState<'idle' | 'waive' | 'remove'>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const act = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (mode === 'remove' && item.id) {
        await removePenalty(item.id);
      } else if (mode === 'waive' && item.kind !== 'MANUAL') {
        if (!reason.trim()) {
          setProblem('Give a reason for waiving it.');
          return;
        }

        await waivePenalty({ staffId: item.staffId, date: item.date, kind: item.kind, reason: reason.trim() });
      }

      setMode('idle');
      onChanged();
    } catch (actError) {
      setProblem(errorMessage(actError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.item}>
      <View style={styles.itemTop}>
        <Text style={styles.itemDate}>{item.date}</Text>
        <Text style={[styles.kind, item.kind === 'MANUAL' ? styles.kindManual : styles.kindAuto]}>{PENALTY_LABELS[item.kind]}</Text>
        <Text style={[styles.itemDays, item.waived && styles.waived]}>{formatDays(item.days)}</Text>
        {item.waived || locked ? null : item.kind === 'MANUAL' ? (
          <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'remove' ? 'idle' : 'remove')} style={styles.action}>
            <Text style={styles.actionText}>Remove</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'waive' ? 'idle' : 'waive')} style={styles.action}>
            <Text style={styles.actionText}>Waive</Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.why, item.waived && styles.waived]}>{item.why}</Text>
      {item.kind === 'MANUAL' && item.byName ? <Text style={styles.by}>Given by {item.byName}</Text> : null}
      {item.waived ? (
        <Text style={styles.by}>
          Waived by {item.byName}: {item.waiverReason}
        </Text>
      ) : null}

      {mode === 'waive' ? (
        <View style={styles.form}>
          <Field label="Why waive it?" value={reason} onChangeText={setReason} placeholder="e.g. called ahead, road was closed" />
          {problem ? <Banner tone="danger" message={problem} /> : null}
          <View style={styles.actions}>
            <Button label="Cancel" variant="ghost" onPress={() => setMode('idle')} disabled={busy} />
            <Button label="Waive penalty" onPress={() => void act()} busy={busy} />
          </View>
        </View>
      ) : null}
      {mode === 'remove' ? (
        <View style={styles.form}>
          <Text style={styles.by}>Remove this {formatDays(item.days)} penalty? This is recorded.</Text>
          {problem ? <Banner tone="danger" message={problem} /> : null}
          <View style={styles.actions}>
            <Button label="Keep it" variant="ghost" onPress={() => setMode('idle')} disabled={busy} />
            <Button label="Remove penalty" variant="danger" onPress={() => void act()} busy={busy} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.md },
  top: { gap: space.sm },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  month: { minWidth: 190, textAlign: 'center', fontSize: font.title, fontWeight: '800', color: colors.text },
  total: { marginLeft: 'auto', fontSize: font.large, fontWeight: '700', color: colors.text },
  rate: { fontSize: font.body, color: colors.textMuted },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { width: 340 },
  detail: { flex: 1 },
  detailContent: { gap: space.md, paddingBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  name: { fontSize: font.title, fontWeight: '800', color: colors.text },
  days: { fontSize: font.large, fontWeight: '700', color: colors.success },
  daysBad: { color: colors.danger },
  form: { gap: space.sm },
  formRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  dateField: { width: 170 },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  item: { gap: 4, paddingVertical: space.sm, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  itemDate: { width: 100, fontSize: font.body, fontWeight: '700', color: colors.text },
  kind: { fontSize: font.small, fontWeight: '700', paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.sm, overflow: 'hidden' },
  kindAuto: { backgroundColor: colors.warningSoft, color: colors.warning },
  kindManual: { backgroundColor: colors.dangerSoft, color: colors.danger },
  itemDays: { flex: 1, fontSize: font.body, fontWeight: '800', color: colors.danger },
  waived: { color: colors.textMuted, textDecorationLine: 'line-through' },
  why: { fontSize: font.body, color: colors.text },
  by: { fontSize: font.small, color: colors.textMuted },
  action: { minHeight: 36, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  actionText: { fontSize: font.small, fontWeight: '700', color: colors.primary },
});
