import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, font, radius, space, TOUCH_TARGET } from '../theme';

export function Panel({ title, action, children, style, scroll = true }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  return (
    <View style={[styles.panel, style]}>
      {title || action ? (
        <View style={styles.panelHeader}>
          {title ? <Text style={styles.panelTitle}>{title}</Text> : <View />}
          {action}
        </View>
      ) : null}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.panelBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.panelBody, styles.fill]}>{children}</View>
      )}
    </View>
  );
}

export function ListRow({ title, subtitle, badge, badgeTone = 'muted', selected, dimmed, onPress }: {
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  badgeTone?: 'muted' | 'success' | 'danger' | 'accent';
  selected?: boolean;
  dimmed?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, dimmed && styles.dimmed]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? <Text style={[styles.badge, badgeStyles[badgeTone]]}>{badge}</Text> : null}
    </Pressable>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggle}>
      <View style={styles.rowText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.rowSubtitle}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

export function ChipSelect<T extends string>({ label, options, selected, onToggle }: {
  label?: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.chipBlock}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.chips}>
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onToggle(option.value)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
        {options.length === 0 ? <Text style={styles.rowSubtitle}>Nothing to choose yet.</Text> : null}
      </View>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <Text style={styles.empty}>{message}</Text>;
}

export function FormRow({ children }: { children: ReactNode }) {
  return <View style={styles.formRow}>{children}</View>;
}

export const formStyles = StyleSheet.create({
  grow: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
});

const badgeStyles = StyleSheet.create({
  muted: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  success: { backgroundColor: colors.successSoft, color: colors.success },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  accent: { backgroundColor: colors.accent, color: colors.onAccent },
});

const styles = StyleSheet.create({
  // flexShrink lets a panel fit the column it sits in, so its own ScrollView scrolls instead of being cut off.
  panel: { flexShrink: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panelTitle: { fontSize: font.large, fontWeight: '700', color: colors.text },
  panelBody: { padding: space.md, gap: space.md },
  fill: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_TARGET + 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  rowSelected: { backgroundColor: colors.selected },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: font.body, fontWeight: '600', color: colors.text },
  rowSubtitle: { fontSize: font.small, color: colors.textMuted },
  dimmed: { color: colors.textMuted, textDecorationLine: 'line-through' },
  badge: { fontSize: font.small, fontWeight: '700', paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TOUCH_TARGET },
  toggleLabel: { fontSize: font.body, color: colors.text },
  chipBlock: { gap: space.xs },
  fieldLabel: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
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
  chipText: { fontSize: font.body, color: colors.text },
  chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
  empty: { fontSize: font.body, color: colors.textMuted, padding: space.md },
  formRow: { flexDirection: 'row', gap: space.md },
});

export function Segments<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={segmentStyles.segments}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={[segmentStyles.segment, value === option.value && segmentStyles.segmentActive]}>
          <Text style={[segmentStyles.segmentText, value === option.value && segmentStyles.segmentTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const segmentStyles = StyleSheet.create({
  segments: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { minHeight: 44, paddingHorizontal: space.lg, justifyContent: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  segmentTextActive: { color: colors.onPrimary },
});
