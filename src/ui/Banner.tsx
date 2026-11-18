import { StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, space } from './theme';

type Tone = 'info' | 'warning' | 'danger' | 'success';

const tones: Record<Tone, { background: string; text: string }> = {
  info: { background: colors.surfaceMuted, text: colors.text },
  warning: { background: colors.warningSoft, text: colors.warning },
  danger: { background: colors.dangerSoft, text: colors.danger },
  success: { background: colors.successSoft, text: colors.success },
};

export function Banner({ tone, message }: { tone: Tone; message: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: tones[tone].background }]} accessibilityRole="alert">
      <Text style={[styles.text, { color: tones[tone].text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.sm, paddingVertical: space.sm, paddingHorizontal: space.md },
  text: { fontSize: font.body, fontWeight: '500' },
});
