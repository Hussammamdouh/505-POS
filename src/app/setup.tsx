import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/ui/Brand';
import { SettingsForm } from '@/ui/SettingsForm';
import { colors, font, radius, space } from '@/ui/theme';

export default function SetupScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <BrandWordmark height={56} />
        </View>
        <Text style={styles.title}>Set up this iPad</Text>
        <Text style={styles.subtitle}>Connect the register to the server and the receipt printer. You can change these later from Settings.</Text>
        <SettingsForm onSaved={() => router.replace('/login')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: space.xxl, gap: space.md },
  hero: { alignItems: 'center', paddingVertical: space.xl, borderRadius: radius.lg, backgroundColor: colors.primary },
  title: { fontSize: font.hero, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font.body, color: colors.textMuted, marginBottom: space.md },
});
