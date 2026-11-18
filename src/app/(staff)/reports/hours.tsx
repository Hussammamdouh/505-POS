import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { addTimeEntry, editTimeEntry, formatDuration, loadAttendance, type AttendanceReport, type TimeEntry } from '@/lib/attendance';
import { cachedStaffTiles } from '@/lib/auth';
import { businessDateOf, cairoTimeToUtc, formatClock, isBusinessDate, isClockTime } from '@/lib/businessDay';
import type { DateRange } from '@/lib/reports';
import type { StaffLoginTile } from '@/lib/types';
import { ChipSelect, Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { DataTable, DateRangeBar, presetRange, type Column } from '@/ui/reports/ReportKit';
import { colors, font, radius, space } from '@/ui/theme';

type Totals = AttendanceReport['totals'][number];

const TOTAL_COLUMNS: Column<Totals>[] = [
  { title: 'Staff', render: (row) => row.staffName },
  { title: 'Periods', width: 80, numeric: true, render: (row) => String(row.entries) },
  { title: 'Hours worked', width: 130, numeric: true, render: (row) => formatDuration(row.minutesWorked) },
];

// What the manager is changing: an existing period, or a period someone forgot to clock at all.
type Editing = { kind: 'edit'; entry: TimeEntry } | { kind: 'add' };

export default function HoursReportScreen() {
  const [range, setRange] = useState<DateRange>(presetRange('week'));
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);

  useEffect(() => {
    let active = true;
    loadAttendance(range.from, range.to)
      .then((data) => active && (setReport(data), setError(null)))
      .catch((loadError) => active && setError(loadError instanceof NetworkError ? 'Reports need the internet.' : describeError(loadError)));
    return () => {
      active = false;
    };
  }, [range, reload]);

  const saved = () => {
    setEditing(null);
    setReload((value) => value + 1);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <DateRangeBar initial="week" onChange={setRange} />
      {error ? <Banner tone="danger" message={error} /> : null}

      {editing ? <EntryEditor editing={editing} onSaved={saved} onCancel={() => setEditing(null)} /> : null}

      {report ? (
        <>
          <Panel title="Hours per person" scroll={false}>
            <DataTable columns={TOTAL_COLUMNS} rows={report.totals} rowKey={(row) => row.staffId} emptyMessage="Nobody clocked in during this period." />
          </Panel>

          <Panel
            title="Clock-in record"
            scroll={false}
            action={<Button label="Add missing period" variant="secondary" onPress={() => setEditing({ kind: 'add' })} />}>
            {report.entries.length === 0 ? <Text style={styles.muted}>No clock-ins in this period.</Text> : null}
            {report.entries.map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.entryMain}>
                  <Text style={styles.entryName}>{entry.staffName}</Text>
                  <Text style={styles.entryTimes}>
                    {businessDateOf(new Date(entry.clockInAt))} · {formatClock(entry.clockInAt)} → {entry.clockOutAt ? formatClock(entry.clockOutAt) : 'still on duty'}
                    {'  '}
                    <Text style={styles.entryHours}>{formatDuration(entry.minutesWorked)}</Text>
                  </Text>
                  {entry.editedByName ? (
                    <Text style={styles.edited}>
                      Corrected by {entry.editedByName}: {entry.editReason}
                    </Text>
                  ) : null}
                </View>
                <Pressable accessibilityRole="button" onPress={() => setEditing({ kind: 'edit', entry })} style={styles.fix}>
                  <Text style={styles.fixText}>Fix times</Text>
                </Pressable>
              </View>
            ))}
          </Panel>
          <Text style={styles.muted}>{"Every correction is saved with the manager's name and reason, and shown here."}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function EntryEditor({ editing, onSaved, onCancel }: { editing: Editing; onSaved: () => void; onCancel: () => void }) {
  const entry = editing.kind === 'edit' ? editing.entry : null;
  const today = businessDateOf(new Date());
  const [staff, setStaff] = useState<StaffLoginTile[]>([]);
  const [staffId, setStaffId] = useState<string | null>(entry?.staffId ?? null);
  const [inDate, setInDate] = useState(entry ? businessDateOf(new Date(entry.clockInAt)) : today);
  const [inTime, setInTime] = useState(entry ? formatClock(entry.clockInAt) : '');
  const [outDate, setOutDate] = useState(entry?.clockOutAt ? businessDateOf(new Date(entry.clockOutAt)) : today);
  const [outTime, setOutTime] = useState(entry?.clockOutAt ? formatClock(entry.clockOutAt) : '');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!entry) {
      void cachedStaffTiles().then(setStaff);
    }
  }, [entry]);

  const save = async () => {
    // Leaving clock-out empty on an existing period keeps the person on duty.
    const keepOpen = entry !== null && outTime.trim() === '';
    if (!staffId) {
      return setProblem('Choose who this is for.');
    }

    if (!isBusinessDate(inDate) || !isClockTime(inTime) || (!keepOpen && (!isBusinessDate(outDate) || !isClockTime(outTime)))) {
      return setProblem('Dates look like 2026-10-31 and times like 13:05 (24-hour).');
    }

    if (!reason.trim()) {
      return setProblem('Give a reason for the change, e.g. "forgot to clock out".');
    }

    const clockInAt = cairoTimeToUtc(inDate.trim(), inTime.trim()).toISOString();
    const clockOutAt = keepOpen ? null : cairoTimeToUtc(outDate.trim(), outTime.trim()).toISOString();
    setBusy(true);
    setProblem(null);
    try {
      if (entry) {
        await editTimeEntry(entry.id, { clockInAt, clockOutAt, reason: reason.trim() });
      } else {
        await addTimeEntry({ staffId, clockInAt, clockOutAt: clockOutAt!, reason: reason.trim() });
      }

      onSaved();
    } catch (saveError) {
      setProblem(describeError(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={entry ? `Fix times · ${entry.staffName}` : 'Add a missing period'} scroll={false}>
      <View style={styles.editor}>
        {!entry ? (
          <ChipSelect
            label="Staff member"
            options={staff.map((tile) => ({ value: tile.id, label: tile.fullName }))}
            selected={staffId ? [staffId] : []}
            onToggle={(value) => setStaffId(value)}
          />
        ) : null}
        <View style={styles.row}>
          <View style={styles.dateField}>
            <Field label="Clock-in date" value={inDate} onChangeText={setInDate} placeholder="YYYY-MM-DD" autoCorrect={false} />
          </View>
          <View style={styles.timeField}>
            <Field label="Time" value={inTime} onChangeText={setInTime} placeholder="13:00" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.dateField}>
            <Field label="Clock-out date" value={outDate} onChangeText={setOutDate} placeholder="YYYY-MM-DD" autoCorrect={false} />
          </View>
          <View style={styles.timeField}>
            <Field
              label="Time"
              value={outTime}
              onChangeText={setOutTime}
              placeholder={entry ? 'empty = on duty' : '23:59'}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. forgot to clock out at the end of the night" />
        {problem ? <Banner tone="danger" message={problem} /> : null}
        <View style={styles.row}>
          <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
          <Button label="Save" onPress={() => void save()} busy={busy} />
        </View>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  muted: { fontSize: font.small, color: colors.textMuted },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryMain: { flex: 1, gap: 2 },
  entryName: { fontSize: font.body, fontWeight: '700', color: colors.text },
  entryTimes: { fontSize: font.body, color: colors.text },
  entryHours: { fontWeight: '700' },
  edited: { fontSize: font.small, color: colors.warning },
  fix: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  fixText: { fontSize: font.small, fontWeight: '700', color: colors.primary },
  editor: { gap: space.md },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end', flexWrap: 'wrap' },
  dateField: { width: 170 },
  timeField: { width: 110 },
});
