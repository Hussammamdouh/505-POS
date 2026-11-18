import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DAY_CHOICES, formatDays } from '@/lib/schedule';
import { colors, font, radius, space } from '@/ui/theme';

/** A number of days of pay: tap ½, 1, 2 ... or type any other amount in quarter days (e.g. 1.5). */
export function DaysPicker({ label, value, onChange, allowZero = false }: {
  label: string;
  value: number;
  onChange: (days: number) => void;
  allowZero?: boolean;
}) {
  const choices = allowZero ? [0, ...DAY_CHOICES] : DAY_CHOICES;
  const [other, setOther] = useState(choices.includes(value) ? '' : String(value));

  const typeOther = (text: string) => {
    setOther(text);
    const days = Number(text.trim().replace(',', '.'));
    // Only whole quarter days are accepted, as the server stores them.
    if (text.trim() && Number.isFinite(days) && days >= (allowZero ? 0 : 0.25) && days <= 30 && Math.round(days * 4) === days * 4) {
      onChange(days);
    }
  };

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {choices.map((days) => {
          const active = value === days && other === '';
          return (
            <Pressable
              key={days}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setOther('');
                onChange(days);
              }}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{days === 0 ? 'None' : formatDays(days)}</Text>
            </Pressable>
          );
        })}
        <TextInput
          value={other}
          onChangeText={typeOther}
          placeholder="Other"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          accessibilityLabel={`${label}, other number of days`}
          style={[styles.other, other !== '' && styles.chipActiveBorder]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xs },
  label: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipActiveBorder: { borderColor: colors.primary, borderWidth: 2 },
  chipText: { fontSize: font.body, color: colors.text },
  chipTextActive: { color: colors.onPrimary, fontWeight: '700' },
  other: {
    width: 90,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: font.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
