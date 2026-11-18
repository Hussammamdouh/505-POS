import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, space } from './theme';

export const PIN_LENGTH = 6;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PinPad({ value, onChange, disabled }: PinPadProps) {
  const press = (key: string) => {
    if (key === 'clear') {
      onChange('');
    } else if (key === 'back') {
      onChange(value.slice(0, -1));
    } else if (value.length < PIN_LENGTH) {
      onChange(value + key);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.dots} accessibilityLabel={`${value.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <View key={index} style={[styles.dot, index < value.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={key === 'back' ? 'Delete digit' : key === 'clear' ? 'Clear' : key}
            onPress={() => press(key)}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed, disabled && styles.disabled]}>
            <Text style={[styles.keyText, key.length > 1 && styles.keyTextSmall]}>
              {key === 'back' ? '⌫' : key === 'clear' ? 'Clear' : key}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const KEY_SIZE = 84;

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: space.xl },
  dots: { flexDirection: 'row', gap: space.md },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.primary },
  dotFilled: { backgroundColor: colors.primary },
  grid: { width: KEY_SIZE * 3 + space.md * 2, flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.selected },
  disabled: { opacity: 0.5 },
  keyText: { fontSize: font.hero, fontWeight: '500', color: colors.text },
  keyTextSmall: { fontSize: font.large },
});
