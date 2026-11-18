import { Stack } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { bootstrap } from '@/lib/bootstrap';
import { useApp } from '@/store/app';
import { BrandWordmark } from '@/ui/Brand';
import { colors, space } from '@/ui/theme';

export default function RootLayout() {
  useKeepAwake();
  const ready = useApp((state) => state.ready);

  useEffect(() => {
    void bootstrap();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {ready ? (
        <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: colors.background } }} />
      ) : (
        <View style={styles.loading}>
          <BrandWordmark height={96} />
          <ActivityIndicator size="large" color={colors.onPrimary} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl, backgroundColor: colors.primary },
});
