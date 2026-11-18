import { Redirect, router, Slot, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { startChime, stopChime } from '@/lib/chime';
import { startLiveOrders, stopLiveOrders } from '@/lib/liveOrders';
import { useApp } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { colors, font, radius, space } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

// Hidden when a manager or admin signed in to view the system rather than run the register.
const REGISTER_ONLY_PATHS = ['/register', '/website'];

export default function StaffLayout() {
  const session = useApp((state) => state.session);
  const connectivity = useApp((state) => state.connectivity);
  const syncNeedsLogin = useApp((state) => state.syncNeedsLogin);
  const unsyncedCount = useApp((state) => state.unsyncedCount);
  const viewingSystem = useApp((state) => state.workspace === 'system');
  // The back office (often another device) never rings or asks to accept online orders; the register does.
  const pendingCount = useApp((state) => (viewingSystem ? 0 : state.openOrders.filter((order) => order.status === 'PENDING').length));
  const pendingWebsite = useApp((state) => state.openOrders.some((order) => order.channel === 'WEB' && order.status === 'PENDING'));
  // Website orders are handled on the Website tab; Talabat orders on the Orders tab.
  const alertTarget = pendingWebsite ? '/website' : '/orders';
  const pathname = usePathname();
  const signedIn = session !== null;

  useEffect(() => {
    if (!signedIn) {
      return;
    }

    startLiveOrders();
    return stopLiveOrders;
  }, [signedIn]);

  useEffect(() => {
    if (pendingCount > 0) {
      startChime();
    } else {
      stopChime();
    }
  }, [pendingCount]);

  useEffect(() => stopChime, []);

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (viewingSystem && REGISTER_ONLY_PATHS.some((path) => pathname.startsWith(path))) {
    return <Redirect href="/reports/today" />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <TopBar />
      {pendingCount > 0 && pathname !== alertTarget ? (
        <Pressable accessibilityRole="button" onPress={() => router.replace(alertTarget)} style={styles.alert}>
          <Text style={styles.alertText}>
            {pendingCount} new online order{pendingCount > 1 ? 's' : ''} waiting — tap to accept
          </Text>
        </Pressable>
      ) : null}
      {connectivity === 'offline' ? (
        <View style={styles.banner}>
          <Banner tone="warning" message="No internet. Orders are saved on this iPad and printed with an OFF code. They will sync automatically." />
        </View>
      ) : null}
      {connectivity === 'online' && syncNeedsLogin && unsyncedCount > 0 ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={`${unsyncedCount} offline order(s) are waiting. Lock and sign in again so they can sync.`} />
        </View>
      ) : null}
      <View style={styles.content}>
        <Slot />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  banner: { paddingHorizontal: space.lg, paddingTop: space.sm },
  alert: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: { fontSize: font.large, fontWeight: '700', color: colors.onAccent },
  content: { flex: 1 },
});
