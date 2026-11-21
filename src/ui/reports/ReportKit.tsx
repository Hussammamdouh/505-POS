import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { addDays, isBusinessDate, todayBusinessDate } from '@/lib/businessDay';
import { formatMoney, toPiastres } from '@/lib/money';
import type { DateRange } from '@/lib/reports';

import { Segments } from '../admin/AdminKit';
import { Button } from '../Button';
import { Field } from '../Field';
import { colors, font, radius, space } from '../theme';

export type Preset = 'today' | 'yesterday' | 'week' | 'last45' | 'month' | 'lastMonth' | 'custom';

/** The owner's standard analysis window. */
export const ANALYSIS_DAYS = 45;

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'last45', label: `Last ${ANALYSIS_DAYS} days` },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];

export function presetRange(preset: Exclude<Preset, 'custom'>): DateRange {
  const today = todayBusinessDate();
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'week':
      return { from: addDays(today, -6), to: today };
    case 'last45':
      return { from: addDays(today, 1 - ANALYSIS_DAYS), to: today };
    case 'month':
      return { from: monthStart, to: today };
    case 'lastMonth': {
      const lastMonthEnd = addDays(monthStart, -1);
      return { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd };
    }
  }
}

/** Preset buttons in one row above the report; Custom reveals from/to fields. */
export function DateRangeBar({ initial = 'month', onChange }: { initial?: Exclude<Preset, 'custom'>; onChange: (range: DateRange) => void }) {
  const [preset, setPreset] = useState<Preset>(initial);
  const [from, setFrom] = useState(presetRange(initial).from);
  const [to, setTo] = useState(presetRange(initial).to);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = (value: Preset) => {
    setPreset(value);
    setProblem(null);
    if (value !== 'custom') {
      const range = presetRange(value);
      setFrom(range.from);
      setTo(range.to);
      onChange(range);
    }
  };

  const applyCustom = () => {
    if (!isBusinessDate(from) || !isBusinessDate(to)) {
      setProblem('Dates must look like 2026-11-30.');
    } else if (to < from) {
      setProblem('The end date must be on or after the start date.');
    } else {
      setProblem(null);
      onChange({ from, to });
    }
  };

  return (
    <View style={styles.rangeBar}>
      <Segments options={PRESETS} value={preset} onChange={pick} />
      {preset === 'custom' ? (
        <View style={styles.custom}>
          <View style={styles.dateField}>
            <Field label="From" value={from} onChangeText={setFrom} placeholder="2026-11-01" autoCorrect={false} />
          </View>
          <View style={styles.dateField}>
            <Field label="To" value={to} onChangeText={setTo} placeholder="2026-11-30" autoCorrect={false} />
          </View>
          <Button label="Show" onPress={applyCustom} />
        </View>
      ) : (
        <Text style={styles.rangeText}>{from === to ? from : `${from} → ${to}`}</Text>
      )}
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </View>
  );
}

export const egp = (amount: number) => formatMoney(toPiastres(amount));

/** Compact money for tiles: 12,480 / 12.5K / 1.2M. */
export function compactEgp(amount: number): string {
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  if (absolute >= 1_000_000) {
    return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
  }

  if (absolute >= 10_000) {
    return `${sign}${(absolute / 1_000).toFixed(1)}K`;
  }

  return `${sign}${Math.round(absolute).toLocaleString('en-US')}`;
}

export function HeroFigure({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <View style={styles.hero}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.heroValue}>{value}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

export function StatTile({ label, value, caption, status }: {
  label: string;
  value: string;
  caption?: string;
  status?: { tone: 'good' | 'bad'; text: string };
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      {status ? (
        <Text style={[styles.status, status.tone === 'good' ? styles.statusGood : styles.statusBad]}>
          {status.tone === 'good' ? '▲ ' : '▼ '}
          {status.text}
        </Text>
      ) : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <View style={styles.kpiRow}>{children}</View>;
}

/** A single ratio against a target: the fill is the brand olive, the track a light step of it. */
export function Meter({ value, target, label, reached }: { value: number; target: number; label: string; reached: boolean }) {
  const ratio = target > 0 ? Math.min(1, Math.max(0, value / target)) : reached ? 1 : 0;
  return (
    <View style={styles.meterBlock} accessible accessibilityLabel={`${label}: ${Math.round(ratio * 100)} percent`}>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, reached && styles.meterFillReached, { width: `${ratio * 100}%` }]} />
      </View>
      <View style={styles.meterLegend}>
        <Text style={styles.caption}>{label}</Text>
        <Text style={styles.caption}>{Math.round(ratio * 100)}%</Text>
      </View>
    </View>
  );
}

export interface StatementLine {
  label: string;
  amount: number;
  kind?: 'add' | 'subtract' | 'total';
  note?: string;
}

/** Profit & loss style rows: subtractions shown with a minus, totals ruled and bold. */
export function StatementTable({ lines }: { lines: StatementLine[] }) {
  return (
    <View>
      {lines.map((line) => (
        <View key={line.label} style={[styles.statementRow, line.kind === 'total' && styles.statementTotal]}>
          <Text style={[styles.statementLabel, line.kind === 'total' && styles.bold]}>
            {line.kind === 'subtract' ? '−  ' : line.kind === 'total' ? '=  ' : '    '}
            {line.label}
            {line.note ? <Text style={styles.caption}>{`   ${line.note}`}</Text> : null}
          </Text>
          <Text style={[styles.statementAmount, line.kind === 'total' && styles.bold]}>{egp(line.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Ranked horizontal bars for one measure; the value sits at the bar tip in text ink. */
export function BarList({ rows, emptyMessage, format = (value: number) => egp(value) }: {
  rows: { label: string; value: number }[];
  emptyMessage: string;
  format?: (value: number) => string;
}) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  if (rows.length === 0 || max <= 0) {
    return <Text style={styles.caption}>{emptyMessage}</Text>;
  }

  return (
    <View style={styles.bars}>
      {rows.map((row) => (
        <View key={row.label} style={styles.barRow} accessible accessibilityLabel={`${row.label}: ${format(row.value)}`}>
          <Text style={styles.barLabel} numberOfLines={1}>
            {row.label}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: `${(row.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.barValue}>{format(row.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export interface Column<T> {
  title: string;
  width?: number;
  numeric?: boolean;
  render: (row: T) => string;
}

export function DataTable<T>({ columns, rows, rowKey, emptyMessage }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
}) {
  return (
    <View>
      <View style={[styles.tableRow, styles.tableHead]}>
        {columns.map((column) => (
          <Text
            key={column.title}
            style={[styles.headCell, column.width ? { width: column.width } : styles.flexCell, column.numeric && styles.numeric]}>
            {column.title}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={rowKey(row)} style={styles.tableRow}>
          {columns.map((column) => (
            <Text
              key={column.title}
              style={[styles.cell, column.width ? { width: column.width } : styles.flexCell, column.numeric && styles.numeric]}
              numberOfLines={2}>
              {column.render(row)}
            </Text>
          ))}
        </View>
      ))}
      {rows.length === 0 ? <Text style={[styles.caption, styles.empty]}>{emptyMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rangeBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  custom: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  dateField: { width: 170 },
  rangeText: { fontSize: font.body, color: colors.textMuted },
  problem: { fontSize: font.small, color: colors.danger },
  hero: { gap: space.xs },
  heroValue: { fontSize: 52, fontWeight: '700', color: colors.text },
  kpiRow: { flexDirection: 'row', gap: space.md },
  tile: {
    flex: 1,
    gap: 2,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileLabel: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  tileValue: { fontSize: 28, fontWeight: '600', color: colors.text },
  caption: { fontSize: font.small, color: colors.textMuted },
  status: { fontSize: font.small, fontWeight: '700' },
  statusGood: { color: colors.success },
  statusBad: { color: colors.danger },
  meterBlock: { gap: space.xs },
  meterTrack: { height: 20, borderRadius: radius.sm, backgroundColor: colors.selected, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: radius.sm, backgroundColor: colors.primary },
  meterFillReached: { backgroundColor: colors.success },
  meterLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  statementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statementTotal: { borderBottomWidth: 2, borderBottomColor: colors.text },
  statementLabel: { flex: 1, fontSize: font.body, color: colors.text },
  statementAmount: { fontSize: font.body, color: colors.text, fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700' },
  bars: { gap: space.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 32 },
  barLabel: { width: 170, fontSize: font.body, color: colors.text },
  barTrack: { flex: 1, height: 20, justifyContent: 'center' },
  bar: { height: 20, backgroundColor: colors.primary, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  barValue: { width: 150, textAlign: 'right', fontSize: font.body, color: colors.text, fontVariant: ['tabular-nums'] },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHead: { minHeight: 40, borderBottomColor: colors.text },
  headCell: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  cell: { fontSize: font.body, color: colors.text, fontVariant: ['tabular-nums'] },
  flexCell: { flex: 1 },
  numeric: { textAlign: 'right' },
  empty: { paddingVertical: space.md },
});
