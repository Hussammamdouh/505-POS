import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, space } from '../theme';

export interface ColumnDatum {
  key: string;
  /** Short axis label, e.g. "14" or "Mon 3". */
  label: string;
  value: number;
  /** Full text shown when the column is tapped. */
  detail: string;
}

const CHART_HEIGHT = 180;
const MAX_COLUMN_WIDTH = 24;

/**
 * One series of columns growing from a shared baseline. Tapping a column (the whole slot is the hit target)
 * shows its value above the chart; otherwise only the highest column is labelled.
 */
export function ColumnChart({ data, emptyMessage, labelEvery = 1 }: { data: ColumnDatum[]; emptyMessage: string; labelEvery?: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(0, ...data.map((datum) => datum.value));

  if (data.length === 0 || max <= 0) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  const peak = data.reduce((best, datum) => (datum.value > best.value ? datum : best), data[0]);
  const focus = data.find((datum) => datum.key === selected) ?? null;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.readout} numberOfLines={1}>
        {focus ? focus.detail : `Highest: ${peak.detail}. Tap a column for details.`}
      </Text>
      <View style={styles.plot}>
        {data.map((datum) => {
          const active = datum.key === (focus?.key ?? null);
          const height = datum.value > 0 ? Math.max(3, (datum.value / max) * CHART_HEIGHT) : 0;
          return (
            <Pressable
              key={datum.key}
              accessibilityRole="button"
              accessibilityLabel={datum.detail}
              onPress={() => setSelected((current) => (current === datum.key ? null : datum.key))}
              style={styles.slot}>
              <View style={[styles.column, { height }, active && styles.columnActive, focus && !active && styles.columnDim]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        {data.map((datum, index) => (
          <Text key={datum.key} style={styles.tick} numberOfLines={1}>
            {index % labelEvery === 0 ? datum.label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space.sm },
  readout: { fontSize: font.body, color: colors.text, fontVariant: ['tabular-nums'] },
  plot: {
    height: CHART_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  slot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 1 },
  column: {
    width: '80%',
    maxWidth: MAX_COLUMN_WIDTH,
    backgroundColor: colors.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  columnActive: { backgroundColor: colors.accent },
  columnDim: { opacity: 0.45 },
  axis: { flexDirection: 'row' },
  tick: { flex: 1, textAlign: 'center', fontSize: 11, color: colors.textMuted },
  empty: { fontSize: font.small, color: colors.textMuted, paddingVertical: space.md },
});
