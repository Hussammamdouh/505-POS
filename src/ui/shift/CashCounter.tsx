import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatEgp, formatMoney, type Piastres } from '@/lib/money';
import { colors, font, radius, space } from '@/ui/theme';

/** The notes the drawer holds, largest first, in piastres (no 1 EGP or 50 piastre coins). */
export const DENOMINATIONS: Piastres[] = [20000, 10000, 5000, 2000, 1000, 500];

export type CashCount = Record<number, number>;

export const countTotal = (count: CashCount): Piastres =>
  DENOMINATIONS.reduce((sum, value) => sum + value * (count[value] ?? 0), 0);

const label = (value: Piastres) => String(value / 100);

/** Count the drawer note by note: tap + / − or type how many of each. */
export function CashCounter({ count, onChange }: { count: CashCount; onChange: (count: CashCount) => void }) {
  const set = (value: Piastres, pieces: number) => onChange({ ...count, [value]: Math.max(0, Math.min(9999, pieces)) });

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {DENOMINATIONS.map((value) => {
          const pieces = count[value] ?? 0;
          return (
            <View key={value} style={styles.row}>
              <Text style={styles.note}>{label(value)}</Text>
              <Text style={styles.times}>×</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`One less ${label(value)}`} onPress={() => set(value, pieces - 1)} style={styles.step}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <TextInput
                accessibilityLabel={`Number of ${label(value)}`}
                value={pieces ? String(pieces) : ''}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                onChangeText={(text) => set(value, Number(text.replace(/\D/g, '')) || 0)}
                keyboardType="number-pad"
                selectTextOnFocus
                style={styles.input}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={`One more ${label(value)}`} onPress={() => set(value, pieces + 1)} style={styles.step}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
              <Text style={styles.subtotal}>{pieces ? formatMoney(value * pieces) : ''}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Counted</Text>
        <Text style={styles.total}>{formatEgp(countTotal(count))}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexBasis: 300, flexGrow: 1 },
  note: { width: 48, fontSize: font.large, fontWeight: '700', color: colors.text, textAlign: 'right' },
  times: { fontSize: font.body, color: colors.textMuted },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: font.title, fontWeight: '700', color: colors.text },
  input: {
    width: 64,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    fontSize: font.large,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  subtotal: { flex: 1, textAlign: 'right', fontSize: font.body, color: colors.textMuted },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: font.large, fontWeight: '600', color: colors.text },
  total: { fontSize: font.title, fontWeight: '700', color: colors.primary },
});
