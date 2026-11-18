import { ScrollView, StyleSheet } from 'react-native';

import { SettingsForm } from '@/ui/SettingsForm';
import { space } from '@/ui/theme';

export default function DeviceSettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SettingsForm />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 640, padding: space.sm },
});
