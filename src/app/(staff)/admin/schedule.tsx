import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { cachedStaffTiles, fetchStaffTiles } from '@/lib/auth';
import { isBusinessDate, isClockTime, todayBusinessDate } from '@/lib/businessDay';
import {
  clearDayChange,
  createShiftTemplate,
  formatDays,
  loadSchedule,
  saveAttendanceRules,
  setDayChange,
  setWeeklyPattern,
  updateShiftTemplate,
  WEEKDAYS,
  type Schedule,
  type ShiftTemplate,
} from '@/lib/schedule';
import type { StaffLoginTile } from '@/lib/types';
import { ChipSelect, EmptyState, FormRow, ListRow, Panel, ToggleRow } from '@/ui/admin/AdminKit';
import { DaysPicker } from '@/ui/DaysPicker';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { colors, font, radius, space } from '@/ui/theme';

type Feedback = { tone: 'success' | 'danger'; message: string } | null;

const OFF = 'OFF';

// The cafe's usual shifts; Morning and Night are also created by migration 020.
const PRESETS = [
  { name: 'Morning', start: '08:00', end: '17:00' },
  { name: 'Night', start: '17:00', end: '02:00' },
  { name: 'Night (late close)', start: '17:00', end: '02:30' },
] as const;

const errorMessage = (error: unknown) => (error instanceof NetworkError ? 'This needs the internet.' : describeError(error));

export default function ScheduleScreen() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [staff, setStaff] = useState<StaffLoginTile[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let active = true;
    loadSchedule()
      .then((loaded) => active && setSchedule(loaded))
      .catch((error) => active && setFeedback({ tone: 'danger', message: errorMessage(error) }));
    void cachedStaffTiles().then((tiles) => active && setStaff(tiles));
    void fetchStaffTiles()
      .then((tiles) => active && setStaff(tiles))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Runs a change and shows its result; changes that return the whole schedule replace it.
  const run = async (task: () => Promise<Schedule | void>, message: string) => {
    setFeedback(null);
    try {
      const updated = await task();
      if (updated) {
        setSchedule(updated);
      } else {
        setSchedule(await loadSchedule());
      }

      setFeedback({ tone: 'success', message });
      return true;
    } catch (error) {
      setFeedback({ tone: 'danger', message: errorMessage(error) });
      return false;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
      {schedule ? (
        <>
          <WeeklyGrid schedule={schedule} staff={staff} run={run} />
          <View style={styles.columns}>
            <View style={styles.column}>
              <ShiftsPanel schedule={schedule} run={run} />
              <RulesPanel schedule={schedule} run={run} />
            </View>
            <View style={styles.column}>
              <DayChangesPanel schedule={schedule} staff={staff} run={run} />
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

type Run = (task: () => Promise<Schedule | void>, message: string) => Promise<boolean>;

type Week = Record<number, string | null>;

function WeeklyGrid({ schedule, staff, run }: { schedule: Schedule; staff: StaffLoginTile[]; run: Run }) {
  const [editing, setEditing] = useState<{ staffId: string; weekday: number | null } | null>(null);
  const templates = new Map(schedule.templates.map((template) => [template.id, template]));
  const weekOf = (staffId: string): Week =>
    Object.fromEntries(
      WEEKDAYS.map(({ weekday }) => [
        weekday,
        schedule.assignments.find((assignment) => assignment.staffId === staffId && assignment.weekday === weekday)?.shiftTemplateId ?? null,
      ]),
    );

  const editingPerson = editing ? staff.find((member) => member.id === editing.staffId) : null;

  return (
    <Panel title="Weekly schedule" scroll={false}>
      {schedule.templates.length === 0 ? <EmptyState message="Add your shifts first (below), then tap a person to set their week." /> : null}
      <View style={styles.gridRow}>
        <Text style={[styles.gridName, styles.gridHead]}>Staff · tap to set the week</Text>
        {WEEKDAYS.map((day) => (
          <Text key={day.weekday} style={[styles.gridCell, styles.gridHead]}>
            {day.short}
          </Text>
        ))}
      </View>
      {staff.map((member) => {
        const week = weekOf(member.id);
        const isEditing = editing?.staffId === member.id;
        return (
          <View key={member.id} style={styles.gridRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Set this person's whole week"
              onPress={() => setEditing({ staffId: member.id, weekday: null })}
              style={[styles.gridNameButton, isEditing && styles.slotSelected]}>
              <Text style={styles.gridName} numberOfLines={1}>
                {member.fullName}
              </Text>
            </Pressable>
            {WEEKDAYS.map((day) => {
              const template = templates.get(week[day.weekday] ?? '');
              return (
                <Pressable
                  key={day.weekday}
                  accessibilityRole="button"
                  accessibilityLabel={`${member.fullName}, ${day.short}: ${template ? template.name : 'off'}`}
                  onPress={() => setEditing({ staffId: member.id, weekday: day.weekday })}
                  style={[styles.gridCell, styles.slot, template && styles.slotOn, isEditing && styles.slotEditing]}>
                  <Text style={[styles.slotText, template && styles.slotTextOn]} numberOfLines={1}>
                    {template ? template.name : 'Off'}
                  </Text>
                  {template ? (
                    <Text style={styles.slotTime} numberOfLines={1}>
                      {template.startTime}–{template.endTime}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        );
      })}
      {editing && editingPerson ? (
        <WeekEditor
          key={`${editing.staffId}-${editing.weekday}`}
          person={editingPerson}
          startDay={editing.weekday}
          initial={weekOf(editing.staffId)}
          schedule={schedule}
          others={staff.filter((member) => member.id !== editing.staffId)}
          weekOf={weekOf}
          onSave={async (week) => {
            const days = WEEKDAYS.map(({ weekday }) => ({ weekday, shiftTemplateId: week[weekday] })).filter((day) => day.shiftTemplateId !== null);
            if (await run(() => setWeeklyPattern(editing.staffId, days), `${editingPerson.fullName}'s week saved.`)) {
              setEditing(null);
            }
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Panel>
  );
}

// Quick day sets: the cafe's week runs Saturday to Friday.
const DAY_SETS: { label: string; weekdays: number[] }[] = [
  { label: 'Every day', weekdays: [6, 0, 1, 2, 3, 4, 5] },
  { label: 'Sat–Thu', weekdays: [6, 0, 1, 2, 3, 4] },
  { label: 'Sun–Thu', weekdays: [0, 1, 2, 3, 4] },
  { label: 'Fri & Sat', weekdays: [5, 6] },
];

/**
 * Sets a person's whole week in a few taps: pick a shift, pick the days it applies to (or a quick
 * set like Sat–Thu), apply, repeat for a second shift if needed, then save once. A week can also be
 * copied from someone else.
 */
function WeekEditor({ person, startDay, initial, schedule, others, weekOf, onSave, onClose }: {
  person: StaffLoginTile;
  startDay: number | null;
  initial: Week;
  schedule: Schedule;
  others: StaffLoginTile[];
  weekOf: (staffId: string) => Week;
  onSave: (week: Week) => Promise<void>;
  onClose: () => void;
}) {
  const activeTemplates = schedule.templates.filter((template) => template.isActive);
  const [week, setWeek] = useState<Week>(initial);
  const [shift, setShift] = useState<string>(activeTemplates[0]?.id ?? OFF);
  const [days, setDays] = useState<number[]>(startDay === null ? [] : [startDay]);
  const [saving, setSaving] = useState(false);
  const names = new Map(schedule.templates.map((template) => [template.id, template.name]));
  const changed = WEEKDAYS.some(({ weekday }) => week[weekday] !== initial[weekday]);

  const toggleDay = (weekday: number) =>
    setDays((current) => (current.includes(weekday) ? current.filter((day) => day !== weekday) : [...current, weekday]));

  const apply = () => {
    setWeek((current) => ({ ...current, ...Object.fromEntries(days.map((weekday) => [weekday, shift === OFF ? null : shift])) }));
    setDays([]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(week);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.editor}>
      <Text style={styles.editorTitle}>{`${person.fullName}'s week`}</Text>

      <ChipSelect
        label="1. Shift"
        options={[...activeTemplates.map((template) => ({ value: template.id, label: `${template.name} ${template.startTime}–${template.endTime}` })), { value: OFF, label: 'Day off' }]}
        selected={[shift]}
        onToggle={setShift}
      />

      <View style={styles.editorBlock}>
        <Text style={styles.editorLabel}>2. Days</Text>
        <View style={styles.dayRow}>
          {WEEKDAYS.map((day) => {
            const active = days.includes(day.weekday);
            return (
              <Pressable
                key={day.weekday}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                onPress={() => toggleDay(day.weekday)}
                style={[styles.dayChip, active && styles.dayChipActive]}>
                <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{day.short}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.dayRow}>
          {DAY_SETS.map((set) => (
            <Pressable key={set.label} accessibilityRole="button" onPress={() => setDays(set.weekdays)} style={styles.quick}>
              <Text style={styles.quickText}>{set.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setDays([])} style={styles.quick}>
            <Text style={styles.quickText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actionsLeft}>
        <Button
          label={days.length ? `3. Apply ${shift === OFF ? 'day off' : names.get(shift)} to ${days.length} day${days.length > 1 ? 's' : ''}` : '3. Pick days to apply'}
          variant="secondary"
          onPress={apply}
          disabled={days.length === 0}
        />
      </View>

      <View style={styles.editorBlock}>
        <Text style={styles.editorLabel}>The week{changed ? ' (not saved yet)' : ''}</Text>
        <View style={styles.dayRow}>
          {WEEKDAYS.map((day) => (
            <View key={day.weekday} style={[styles.previewDay, week[day.weekday] && styles.slotOn]}>
              <Text style={styles.previewWeekday}>{day.short}</Text>
              <Text style={[styles.slotText, week[day.weekday] && styles.slotTextOn]} numberOfLines={1}>
                {week[day.weekday] ? names.get(week[day.weekday]!) : 'Off'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {others.length > 0 ? (
        <View style={styles.editorBlock}>
          <Text style={styles.editorLabel}>Or copy the week of</Text>
          <View style={styles.dayRow}>
            {others.map((other) => (
              <Pressable key={other.id} accessibilityRole="button" onPress={() => setWeek(weekOf(other.id))} style={styles.quick}>
                <Text style={styles.quickText}>{other.fullName}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
        <Button label="Save week" onPress={() => void save()} busy={saving} disabled={!changed} />
      </View>
    </View>
  );
}

function ShiftsPanel({ schedule, run }: { schedule: Schedule; run: Run }) {
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null);

  return (
    <Panel title="Shifts" scroll={false} action={<Button label="+ Add shift" onPress={() => setEditing('new')} />}>
      {schedule.templates.length === 0 && editing === null ? <EmptyState message="No shifts yet, e.g. Morning 08:00–17:00 and Night 17:00–02:00." /> : null}
      {schedule.templates.map((template) => (
        <ListRow
          key={template.id}
          title={template.name}
          subtitle={`${template.startTime} – ${template.endTime}${template.endsNextDay ? ' (next day)' : ''}`}
          badge={template.isActive ? null : 'Not used'}
          dimmed={!template.isActive}
          selected={editing !== 'new' && editing?.id === template.id}
          onPress={() => setEditing(template)}
        />
      ))}
      {editing ? <ShiftForm key={editing === 'new' ? 'new' : editing.id} template={editing === 'new' ? null : editing} run={run} onDone={() => setEditing(null)} /> : null}
    </Panel>
  );
}

function ShiftForm({ template, run, onDone }: { template: ShiftTemplate | null; run: Run; onDone: () => void }) {
  const [name, setName] = useState(template?.name ?? '');
  const [start, setStart] = useState(template?.startTime ?? '');
  const [end, setEnd] = useState(template?.endTime ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [problem, setProblem] = useState<string | null>(null);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setName(preset.name);
    setStart(preset.start);
    setEnd(preset.end);
  };

  const save = async () => {
    if (!name.trim() || !isClockTime(start) || !isClockTime(end)) {
      setProblem('Give the shift a name and times like 08:00 and 17:00 (24-hour).');
      return;
    }

    const body = { name: name.trim(), startTime: start.trim(), endTime: end.trim(), isActive };
    const saved = await run(
      async () => {
        await (template ? updateShiftTemplate(template.id, body) : createShiftTemplate(body));
      },
      template ? 'Shift updated.' : 'Shift added.',
    );
    if (saved) {
      onDone();
    }
  };

  return (
    <View style={styles.form}>
      {!template ? (
        <ChipSelect
          label="Start from"
          options={PRESETS.map((preset) => ({ value: preset.name, label: `${preset.name} ${preset.start}–${preset.end}` }))}
          selected={PRESETS.filter((preset) => preset.name === name && preset.start === start && preset.end === end).map((preset) => preset.name)}
          onToggle={(value) => applyPreset(PRESETS.find((preset) => preset.name === value)!)}
        />
      ) : null}
      <Field label="Name" value={name} onChangeText={setName} placeholder="Morning" />
      <FormRow>
        <View style={styles.grow}>
          <Field label="Starts" value={start} onChangeText={setStart} placeholder="08:00" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={styles.grow}>
          <Field label="Ends" value={end} onChangeText={setEnd} placeholder="17:00" keyboardType="numbers-and-punctuation" />
        </View>
      </FormRow>
      <Text style={styles.hint}>An end time earlier than the start (e.g. 17:00 to 02:00) means the shift ends after midnight.</Text>
      <ToggleRow label="In use" value={isActive} onChange={setIsActive} />
      {problem ? <Banner tone="danger" message={problem} /> : null}
      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onDone} />
        <Button label="Save shift" onPress={() => void save()} />
      </View>
    </View>
  );
}

function RulesPanel({ schedule, run }: { schedule: Schedule; run: Run }) {
  const [grace, setGrace] = useState(String(schedule.settings.graceMinutes));
  const [late, setLate] = useState(schedule.settings.latePenaltyDays);
  const [early, setEarly] = useState(schedule.settings.earlyLeavePenaltyDays);
  const [noShow, setNoShow] = useState(schedule.settings.noShowPenaltyDays);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const graceMinutes = Number(grace.trim());
    if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 240) {
      setProblem('Free minutes are a whole number from 0 to 240.');
      return;
    }

    setProblem(null);
    await run(async () => {
      await saveAttendanceRules({ graceMinutes, latePenaltyDays: late, earlyLeavePenaltyDays: early, noShowPenaltyDays: noShow });
    }, 'Penalty rules saved.');
  };

  return (
    <Panel title="Automatic penalties (days of pay)" scroll={false}>
      <View style={styles.form}>
        <Field label="Free minutes before it counts" value={grace} onChangeText={setGrace} keyboardType="number-pad" />
        <DaysPicker label="Late arrival" value={late} onChange={setLate} allowZero />
        <DaysPicker label="Leaving early" value={early} onChange={setEarly} allowZero />
        <DaysPicker label="No-show" value={noShow} onChange={setNoShow} allowZero />
        <Text style={styles.hint}>
          Late {formatDays(late)}, early {formatDays(early)}, no-show {formatDays(noShow)}. 0 means it is shown but costs nothing. Changes apply to every
          period, past and future, the next time it is opened.
        </Text>
        {problem ? <Banner tone="danger" message={problem} /> : null}
        <View style={styles.actions}>
          <Button label="Save rules" onPress={() => void save()} />
        </View>
      </View>
    </Panel>
  );
}

function DayChangesPanel({ schedule, staff, run }: { schedule: Schedule; staff: StaffLoginTile[]; run: Run }) {
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(todayBusinessDate());
  const [shiftId, setShiftId] = useState<string>(OFF);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const names = new Map(staff.map((member) => [member.id, member.fullName]));

  const save = async () => {
    if (!staffId || !isBusinessDate(date)) {
      setProblem('Choose who, and a date like 2026-11-05.');
      return;
    }

    setProblem(null);
    const saved = await run(
      () => setDayChange({ staffId, date: date.trim(), shiftTemplateId: shiftId === OFF ? null : shiftId, reason: reason.trim() || null }),
      'Day changed.',
    );
    if (saved) {
      setReason('');
    }
  };

  return (
    <Panel title="Change one day" scroll={false}>
      <View style={styles.form}>
        <Text style={styles.hint}>Swap a shift or give a day off on one date, without changing the weekly schedule.</Text>
        <ChipSelect label="Who" options={staff.map((member) => ({ value: member.id, label: member.fullName }))} selected={staffId ? [staffId] : []} onToggle={setStaffId} />
        <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCorrect={false} />
        <ChipSelect
          label="Works"
          options={[...schedule.templates.filter((template) => template.isActive).map((template) => ({ value: template.id, label: template.name })), { value: OFF, label: 'Day off' }]}
          selected={[shiftId]}
          onToggle={setShiftId}
        />
        <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. swapped with Omar" />
        {problem ? <Banner tone="danger" message={problem} /> : null}
        <View style={styles.actions}>
          <Button label="Save day" onPress={() => void save()} />
        </View>
      </View>

      {schedule.upcomingOverrides.length > 0 ? <Text style={styles.subhead}>Coming up</Text> : null}
      {schedule.upcomingOverrides.map((change) => (
        <View key={`${change.staffId}-${change.date}`} style={styles.change}>
          <Text style={styles.changeText}>
            {change.date} · {names.get(change.staffId) ?? 'Staff'} · {change.shiftName ?? 'Day off'}
            {change.reason ? ` (${change.reason})` : ''}
          </Text>
          <Button label="Remove" variant="ghost" onPress={() => void run(() => clearDayChange(change.staffId, change.date), 'Day change removed.')} />
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  columns: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  column: { flex: 1, gap: space.md },
  grow: { flex: 1 },
  form: { gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  hint: { fontSize: font.small, color: colors.textMuted },
  subhead: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, marginTop: space.sm },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  gridHead: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  gridName: { width: 142, fontSize: font.body, fontWeight: '600', color: colors.text },
  gridCell: { flex: 1 },
  slot: {
    minHeight: 52,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotOn: { backgroundColor: colors.selected, borderColor: colors.primary },
  slotSelected: { borderWidth: 3, borderColor: colors.accent },
  slotEditing: { borderColor: colors.accent },
  gridNameButton: { width: 150, minHeight: 52, justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: 4 },
  editor: { gap: space.md, padding: space.md, marginTop: space.sm, borderRadius: radius.md, borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.background },
  editorTitle: { fontSize: font.large, fontWeight: '800', color: colors.text },
  editorBlock: { gap: space.xs },
  editorLabel: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dayChip: { width: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  dayChipTextActive: { color: colors.onPrimary },
  quick: { minHeight: 40, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.primary },
  quickText: { fontSize: font.small, fontWeight: '700', color: colors.primary },
  actionsLeft: { flexDirection: 'row' },
  previewDay: { width: 84, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  previewWeekday: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  slotText: { fontSize: font.small, color: colors.textMuted },
  slotTextOn: { color: colors.primary, fontWeight: '700' },
  slotTime: { fontSize: 11, color: colors.textMuted },
  picker: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  change: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  changeText: { flex: 1, fontSize: font.body, color: colors.text },
});
