import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, usePathname, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { runSync } from '@/lib/sync';
import { canManage, useApp } from '@/store/app';
import { ADMIN_SECTIONS } from '@/ui/admin/sections';
import { REPORT_SECTIONS } from '@/ui/reports/sections';

import { BrandWordmark } from './Brand';
import { ClockOutDialog } from './ClockOutDialog';
import type { Section } from './SectionNav';
import { colors, font, radius, space } from './theme';
import { useCompact } from './useCompact';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TABS: { label: string; icon: IconName; href: Href; section?: { prefix: string; pages: Section[] }; managerOnly?: boolean; registerOnly?: boolean }[] = [
  { label: 'Register', icon: 'cash-register', href: '/register', registerOnly: true },
  { label: 'Website', icon: 'web', href: '/website', registerOnly: true },
  { label: 'Orders', icon: 'receipt-text-outline', href: '/orders' },
  { label: 'Stock', icon: 'package-variant-closed', href: '/stock' },
  { label: 'Shift', icon: 'cash-multiple', href: '/shift' },
  { label: 'Clock-in', icon: 'clock-outline', href: '/clock' },
  { label: 'Penalties', icon: 'gavel', href: '/penalties', managerOnly: true },
  { label: 'Reports', icon: 'chart-bar', href: '/reports/today', section: { prefix: '/reports', pages: REPORT_SECTIONS }, managerOnly: true },
  { label: 'Admin', icon: 'cog-outline', href: '/admin/device', section: { prefix: '/admin', pages: ADMIN_SECTIONS }, managerOnly: true },
];

const ROLE_LABELS = { BARISTA: 'Barista', MANAGER: 'Manager', ADMIN: 'Admin' } as const;

const MUTED_ON_PRIMARY = 'rgba(255, 255, 255, 0.72)';

export function TopBar() {
  const pathname = usePathname();
  const session = useApp((state) => state.session);
  const viewingSystem = useApp((state) => state.workspace === 'system');
  const connectivity = useApp((state) => state.connectivity);
  const unsyncedCount = useApp((state) => state.unsyncedCount);
  const shift = useApp((state) => state.shift);
  const openCount = useApp((state) => state.openOrders.filter((order) => order.channel === 'WEB').length);
  const pendingCount = useApp((state) => state.openOrders.filter((order) => order.channel === 'WEB' && order.status === 'PENDING').length);

  const [clockingOut, setClockingOut] = useState(false);
  // Compact: the connection pill drops its text, Clock out becomes an icon, the user chip shows the first
  // name only, and the tabs tighten up.
  const compact = useCompact();

  const lock = () => {
    useApp.getState().set({ session: null, workspace: 'register' });
    router.replace('/login');
  };

  const offline = connectivity === 'offline';
  const statusText = offline ? 'Offline' : connectivity === 'online' ? 'Online' : 'Connecting…';

  return (
    <View style={[styles.bar, compact && styles.barCompact]}>
      <BrandWordmark height={compact ? 30 : 38} style={styles.logo} />

      <View style={[styles.tabs, compact && styles.tabsCompact]}>
        {TABS.filter((tab) => (!tab.managerOnly || canManage(session)) && !(tab.registerOnly && viewingSystem)).map((tab) => {
          const active = tab.section
            ? pathname.startsWith(tab.section.prefix)
            : pathname === tab.href || (tab.href === '/shift' && pathname.startsWith('/shifts/'));
          // A section tab opens the first page this role may use (e.g. admins land on Menu, managers on Expenses).
          const href = tab.section?.pages.find((page) => page.allowed(session))?.href ?? tab.href;
          const badge = tab.href === '/website' && openCount > 0 ? openCount : 0;
          return (
            <Pressable
              key={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={badge ? `${tab.label}, ${badge} open` : tab.label}
              onPress={() => router.replace(href)}
              style={({ pressed }) => [styles.tab, compact && styles.tabCompact, active && styles.tabActive, pressed && !active && styles.tabPressed]}>
              <View>
                <MaterialCommunityIcons name={tab.icon} size={compact ? 22 : 24} color={active ? colors.primary : MUTED_ON_PRIMARY} />
                {badge ? (
                  // Burgundy while a website order is waiting to be accepted, quieter otherwise.
                  <View style={[styles.badge, pendingCount > 0 ? styles.badgeAlert : styles.badgeQuiet]}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabText, compact && styles.tabTextCompact, active && styles.tabTextActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.status, compact && styles.statusCompact]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${statusText}${unsyncedCount > 0 ? `, ${unsyncedCount} orders to sync` : ''}. Tap to sync now.`}
          onPress={() => void runSync()}
          style={[styles.connection, compact && styles.connectionCompact]}>
          <View style={[styles.dot, { backgroundColor: offline ? '#FF8A80' : connectivity === 'online' ? '#7EE2A0' : MUTED_ON_PRIMARY }]} />
          {compact ? null : <Text style={styles.connectionText}>{statusText}</Text>}
          {unsyncedCount > 0 ? (
            <View style={styles.syncChip}>
              <MaterialCommunityIcons name="sync" size={14} color={colors.accentDeep} />
              <Text style={styles.syncText}>{unsyncedCount}</Text>
            </View>
          ) : null}
        </Pressable>

        <View style={[styles.user, compact && styles.userCompact]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{session?.fullName.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.userName} numberOfLines={1}>
              {compact ? session?.fullName.trim().split(/s+/)[0] : session?.fullName}
              {session && !compact ? <Text style={styles.userRole}>  {ROLE_LABELS[session.role]}</Text> : null}
            </Text>
            <Text style={[styles.drawer, !shift && styles.drawerClosed]} numberOfLines={1}>
              {shift ? `Drawer open · ${shift.staffName}` : 'Drawer closed'}
            </Text>
          </View>
        </View>

        {session && !viewingSystem ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clock out and lock"
            onPress={() => setClockingOut(true)}
            style={({ pressed }) => [styles.lock, !compact && styles.clockOut, pressed && styles.tabPressed]}>
            <MaterialCommunityIcons name="exit-run" size={22} color={colors.onPrimary} />
            {compact ? null : <Text style={styles.clockOutText}>Clock out</Text>}
          </Pressable>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityLabel="Lock the register" onPress={lock} style={({ pressed }) => [styles.lock, pressed && styles.tabPressed]}>
          <MaterialCommunityIcons name="lock-outline" size={24} color={colors.onPrimary} />
        </Pressable>
      </View>

      {clockingOut && session ? (
        <ClockOutDialog
          staffId={session.staffId}
          fullName={session.fullName}
          onClose={() => setClockingOut(false)}
          onDone={() => {
            setClockingOut(false);
            lock();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs + 2,
    backgroundColor: colors.primary,
  },
  barCompact: { gap: space.md, paddingHorizontal: space.md },
  logo: { marginRight: space.sm },
  // space-evenly hands whatever width is left over to the gaps between tabs, so they never overflow.
  tabs: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', gap: 2 },
  tabsCompact: { gap: space.xs },
  tab: {
    minWidth: 66,
    minHeight: 58,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.md,
  },
  tabCompact: { minWidth: 58, minHeight: 54, paddingHorizontal: 4 },
  tabActive: { backgroundColor: colors.surface },
  tabPressed: { backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED_ON_PRIMARY },
  tabTextCompact: { fontSize: 12 },
  tabTextActive: { color: colors.primary, fontWeight: '800' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  badgeAlert: { backgroundColor: colors.accent },
  badgeQuiet: { backgroundColor: '#8A8C5A' },
  badgeText: { fontSize: 11, fontWeight: '800', color: colors.onAccent },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusCompact: { gap: space.sm },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  connectionCompact: { paddingHorizontal: space.sm + 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  connectionText: { fontSize: font.small, fontWeight: '700', color: colors.onPrimary },
  syncChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.warningSoft,
  },
  syncText: { fontSize: 12, fontWeight: '800', color: colors.accentDeep },
  user: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.md,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    maxWidth: 210,
  },
  userCompact: { paddingRight: space.sm, maxWidth: 150 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: font.body, fontWeight: '800', color: colors.onAccent },
  userName: { fontSize: font.body, fontWeight: '700', color: colors.onPrimary },
  userRole: { fontSize: 12, fontWeight: '600', color: MUTED_ON_PRIMARY },
  drawer: { fontSize: 12, color: MUTED_ON_PRIMARY },
  drawerClosed: { color: '#FFD18A', fontWeight: '700' },
  lock: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  clockOut: { width: 'auto', flexDirection: 'row', gap: space.xs, paddingHorizontal: space.md },
  clockOutText: { fontSize: font.small, fontWeight: '700', color: colors.onPrimary },
});
