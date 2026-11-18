import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { addDays, formatClock, todayBusinessDate } from '@/lib/businessDay';
import {
  formatDays,
  formatMinutes,
  loadAttendanceDay,
  PENALTY_LABELS,
  STATUS_LABELS,
  waivePenalty,
  type AttendanceDay,
  type PenaltyLine,
  type ScheduledShift,
  type ShiftStatus,
} from '@/lib/schedule';
import { EmptyState, Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { colors, font, radius, space } from '@/ui/theme';

// Today refreshes on its own so the page can stay open as a live board.
const REFRESH_MS = 30000;

const STATUS_COLORS: Record<ShiftStatus, { background: string; text: string }> = {
  UPCOMING: { background: colors.surfaceMuted, text: colors.textMuted },
  NOT_IN_YET: { background: colors.warningSoft, text: colors.warning },
  ON_DUTY: { background: colors.successSoft, text: colors.success },
  DONE: { background: colors.surfaceMuted, text: colors.text },
  NO_SHOW: { background: colors.dangerSoft, text: colors.danger },
};

const errorMessage = (error: unknown) => (error instanceof NetworkError ? 'This needs the internet.' : describeError(error));

const shiftKey = (shift: ScheduledShift) => `${shift.staffId}-${shift.date}`;

export default function AttendanceScreen() {
  const [date, setDate] = useState(todayBusinessDate());
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () =>
      loadAttendanceDay(date)
        .then((loaded) => active && (setDay(loaded), setError(null)))
        .catch((loadError) => active && setError(errorMessage(loadError)));
    void load();
    const timer = date === todayBusinessDate() ? setInterval(() => void load(), REFRESH_MS) : null;
    return () => {
      active = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [date, reload]);

  const shifts = day?.date === date ? day.shifts : [];
  const penaltyDays = shifts.flatMap((shift) => shift.penalties).filter((line) => !line.waived).reduce((sum, line) => sum + line.days, 0);
  const isToday = date === todayBusinessDate();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.dateBar}>
        <Button label="‹ Previous day" variant="secondary" onPress={() => setDate(addDays(date, -1))} />
        <Text style={styles.date}>{isToday ? `Today · ${date}` : date}</Text>
        <Button label="Next day ›" variant="secondary" onPress={() => setDate(addDays(date, 1))} disabled={isToday} />
        {!isToday ? <Button label="Today" variant="ghost" onPress={() => setDate(todayBusinessDate())} /> : null}
      </View>
      {error ? <Banner tone="danger" message={error} /> : null}

      <View style={styles.stats}>
        <Stat label="Scheduled" value={String(shifts.length)} />
        <Stat label="On duty" value={String(shifts.filter((shift) => shift.status === 'ON_DUTY').length)} tone="success" />
        <Stat label="Late" value={String(shifts.filter((shift) => shift.penalties.some((line) => line.kind === 'LATE')).length)} tone="warning" />
        <Stat label="No-shows" value={String(shifts.filter((shift) => shift.status === 'NO_SHOW').length)} tone="danger" />
        <Stat label="Penalties" value={penaltyDays > 0 ? formatDays(penaltyDays) : 'None'} tone={penaltyDays > 0 ? 'danger' : undefined} />
      </View>

      <Panel title="Schedule against the clock" scroll={false}>
        {day && shifts.length === 0 ? <EmptyState message="Nobody is scheduled on this day. Set up shifts and assign people in Admin → Schedule." /> : null}
        {shifts.map((shift) => (
          <ShiftRow key={shiftKey(shift)} shift={shift} onWaived={() => setReload((value) => value + 1)} />
        ))}
        {day ? (
          <Text style={styles.rules}>
            Rules: {day.settings.graceMinutes} minutes free. Late {formatDays(day.settings.latePenaltyDays)}, leaving early{' '}
            {formatDays(day.settings.earlyLeavePenaltyDays)}, no-show {formatDays(day.settings.noShowPenaltyDays)}. Add penalties by hand on the Penalties tab.
          </Text>
        ) : null}
      </Panel>

      <Panel title="Clock-in log" scroll={false}>
        {day && day.events.length === 0 ? <EmptyState message="No one clocked in or out on this day." /> : null}
        {day?.events.map((event, index) => (
          <View key={`${event.staffId}-${event.at}-${index}`} style={styles.event}>
            <Text style={styles.eventTime}>{formatClock(event.at)}</Text>
            <Text style={[styles.pill, event.kind === 'IN' ? styles.pillIn : styles.pillOut]}>{event.kind === 'IN' ? 'Clocked in' : 'Clocked out'}</Text>
            <Text style={styles.eventName}>{event.staffName}</Text>
            {event.edited ? <Text style={styles.edited}>corrected by a manager</Text> : null}
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'danger' }) {
  const color = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ShiftRow({ shift, onWaived }: { shift: ScheduledShift; onWaived: () => void }) {
  const [waiving, setWaiving] = useState<PenaltyLine | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const status = STATUS_COLORS[shift.status];

  const waive = async () => {
    if (!waiving) {
      return;
    }

    if (!reason.trim()) {
      setProblem('Give a reason, e.g. "road closed, called ahead".');
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      await waivePenalty({ staffId: shift.staffId, date: shift.date, kind: waiving.kind, reason: reason.trim() });
      setWaiving(null);
      setReason('');
      onWaived();
    } catch (waiveError) {
      setProblem(errorMessage(waiveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.shift}>
      <View style={styles.shiftTop}>
        <View style={styles.shiftWho}>
          <Text style={styles.staffName}>{shift.staffName}</Text>
          <Text style={styles.shiftName}>
            {shift.shiftName} · {formatClock(shift.scheduledStart)}–{formatClock(shift.scheduledEnd)}
            {shift.fromOverride ? '  (changed for this day)' : ''}
          </Text>
        </View>
        <View style={styles.times}>
          <Text style={styles.timeLabel}>In</Text>
          <Text style={[styles.time, shift.lateMinutes > 0 && shift.clockInAt && styles.timeBad]}>
            {shift.clockInAt ? formatClock(shift.clockInAt) : '—'}
            {shift.lateMinutes > 0 && shift.clockInAt ? `  +${formatMinutes(shift.lateMinutes)}` : ''}
          </Text>
        </View>
        <View style={styles.times}>
          <Text style={styles.timeLabel}>Out</Text>
          <Text style={[styles.time, shift.earlyLeaveMinutes > 0 && styles.timeBad]}>
            {shift.clockOutAt ? formatClock(shift.clockOutAt) : shift.status === 'ON_DUTY' ? 'on duty' : '—'}
            {shift.earlyLeaveMinutes > 0 ? `  −${formatMinutes(shift.earlyLeaveMinutes)}` : ''}
          </Text>
        </View>
        <Text style={[styles.status, { backgroundColor: status.background, color: status.text }]}>
          {shift.status === 'NOT_IN_YET' && shift.lateMinutes > 0 ? `Late ${formatMinutes(shift.lateMinutes)}` : STATUS_LABELS[shift.status]}
        </Text>
      </View>

      {shift.penalties.map((line) => (
        <View key={line.kind} style={styles.penalty}>
          <Text style={[styles.penaltyText, line.waived && styles.waived]}>
            {PENALTY_LABELS[line.kind]}
            {line.minutes > 0 ? ` ${formatMinutes(line.minutes)}` : ''} · {formatDays(line.days)}
          </Text>
          {line.waived ? (
            <Text style={styles.waiver}>
              Waived by {line.waivedByName}: {line.waiverReason}
            </Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setWaiving(line)} style={styles.waiveButton}>
              <Text style={styles.waiveText}>Waive</Text>
            </Pressable>
          )}
        </View>
      ))}

      {waiving ? (
        <View style={styles.waiveForm}>
          <Field label={`Why waive the ${PENALTY_LABELS[waiving.kind].toLowerCase()} penalty?`} value={reason} onChangeText={setReason} />
          {problem ? <Banner tone="danger" message={problem} /> : null}
          <View style={styles.waiveActions}>
            <Button label="Cancel" variant="ghost" onPress={() => setWaiving(null)} disabled={busy} />
            <Button label="Waive penalty" onPress={() => void waive()} busy={busy} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  dateBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  date: { fontSize: font.large, fontWeight: '700', color: colors.text, minWidth: 200, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  statValue: { fontSize: font.title, fontWeight: '800' },
  statLabel: { fontSize: font.small, color: colors.textMuted },
  rules: { fontSize: font.small, color: colors.textMuted, paddingHorizontal: space.sm },
  shift: { gap: space.xs, paddingVertical: space.sm, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  shiftTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  shiftWho: { flex: 1, gap: 2 },
  staffName: { fontSize: font.body, fontWeight: '700', color: colors.text },
  shiftName: { fontSize: font.small, color: colors.textMuted },
  times: { width: 130, gap: 2 },
  timeLabel: { fontSize: 12, color: colors.textMuted },
  time: { fontSize: font.body, fontWeight: '600', color: colors.text },
  timeBad: { color: colors.danger },
  status: { minWidth: 110, textAlign: 'center', fontSize: font.small, fontWeight: '700', paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm, overflow: 'hidden' },
  penalty: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg },
  penaltyText: { fontSize: font.small, fontWeight: '700', color: colors.danger },
  waived: { color: colors.textMuted, textDecorationLine: 'line-through' },
  waiver: { flex: 1, fontSize: font.small, color: colors.textMuted },
  waiveButton: { minHeight: 36, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  waiveText: { fontSize: font.small, fontWeight: '700', color: colors.primary },
  waiveForm: { gap: space.sm, paddingLeft: space.lg, paddingTop: space.xs },
  waiveActions: { flexDirection: 'row', gap: space.sm },
  event: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs, paddingHorizontal: space.sm },
  eventTime: { width: 60, fontSize: font.body, fontWeight: '700', color: colors.text },
  pill: { width: 110, textAlign: 'center', fontSize: font.small, fontWeight: '700', paddingVertical: 3, borderRadius: radius.sm, overflow: 'hidden' },
  pillIn: { backgroundColor: colors.successSoft, color: colors.success },
  pillOut: { backgroundColor: colors.surfaceMuted, color: colors.text },
  eventName: { flex: 1, fontSize: font.body, color: colors.text },
  edited: { fontSize: font.small, color: colors.warning },
});
