import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, describeError, NetworkError } from '@/lib/api';
import { cachedStaffTiles, fetchStaffTiles, forgetOfflineVerifier, loginOffline, loginOnline, type StaffSession } from '@/lib/auth';
import { refreshPopularity, refreshPrintingOptions } from '@/lib/catalog';
import { refreshOffers } from '@/lib/discounts';
import { clockIn, fetchOnDuty, type OnDutyStaff } from '@/lib/attendance';
import { clockOffline, forgetClockEvents, localOnDuty, pendingClockEventsFor, recordClockIn, rememberOnDuty } from '@/lib/offlineClock';
import { refreshShift } from '@/lib/shift';
import { runSync } from '@/lib/sync';
import type { StaffLoginTile } from '@/lib/types';
import { homeFor, useApp, type Workspace } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { BrandCharacter, BrandWordmark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { ClockPanel } from '@/ui/ClockPanel';
import { PIN_LENGTH, PinPad } from '@/ui/PinPad';
import { colors, font, radius, space } from '@/ui/theme';

const ROLE_LABELS = { BARISTA: 'Barista', MANAGER: 'Manager', ADMIN: 'Admin' } as const;

type Mode = 'signin' | 'clock';

/** Signs in and opens the chosen workspace; online-only refreshes start when there is a server token. */
function enter(session: StaffSession, chosen: Workspace) {
  useApp.getState().set({ session, workspace: chosen, syncNeedsLogin: false, loginNotice: null });
  if (session.token) {
    void refreshShift().catch(() => undefined);
    void refreshPrintingOptions().catch(() => undefined);
    void refreshOffers().catch(() => undefined);
    void refreshPopularity().catch(() => undefined);
    void runSync();
  }

  router.replace(homeFor(chosen));
}

/**
 * After an instant sign-in on this iPad: signs in with the server too (sending the saved clock-in) to get
 * a token. No internet just leaves the iPad session running, as when offline. If the server refuses the
 * PIN (changed, or the account was turned off), the person is signed out.
 */
async function confirmWithServer(staffId: string, pin: string, chosen: Workspace) {
  try {
    const attempt = async () => {
      const pending = await pendingClockEventsFor(staffId);
      const session = await loginOnline(staffId, pin, pending, chosen === 'system', true);
      await forgetClockEvents(pending.map((event) => event.id));
      return session;
    };

    // This iPad thought they were on duty but the server disagrees (clocked out elsewhere): clock in there and retry.
    const server = await attempt().catch(async (error: unknown) => {
      if (!(error instanceof ApiError && error.status === 403 && chosen === 'register')) {
        throw error;
      }

      await clockIn(staffId, pin);
      return attempt();
    });
    if (useApp.getState().session?.staffId === staffId) {
      enterQuietly(server);
    }
  } catch (error) {
    if (error instanceof NetworkError || useApp.getState().session?.staffId !== staffId) {
      return;
    }

    if (error instanceof ApiError && error.status === 401) {
      await forgetOfflineVerifier(staffId);
    }

    useApp.getState().set({ session: null, workspace: 'register', loginNotice: `Signed out: ${describeError(error)}` });
    router.replace('/login');
  }
}

/** Swaps the iPad session for the server one without leaving the current screen. */
function enterQuietly(session: StaffSession) {
  useApp.getState().set({ session, syncNeedsLogin: false });
  void refreshShift().catch(() => undefined);
  void refreshPrintingOptions().catch(() => undefined);
  void refreshOffers().catch(() => undefined);
  void runSync();
}

export default function LoginScreen() {
  const connectivity = useApp((state) => state.connectivity);
  const loginNotice = useApp((state) => state.loginNotice);
  const [tiles, setTiles] = useState<StaffLoginTile[]>([]);
  const [selected, setSelected] = useState<StaffLoginTile | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('signin');
  // Managers and admins choose the register or the back office before their PIN; baristas always get the register.
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  // Who is clocked in, so the PIN screen can say it will clock you in too.
  const [onDuty, setOnDuty] = useState<OnDutyStaff[]>([]);

  useEffect(() => {
    void cachedStaffTiles().then(setTiles);
    void fetchStaffTiles().then(setTiles).catch(() => undefined);
    void localOnDuty().then(setOnDuty);
    void fetchOnDuty()
      .then(async (staff) => {
        await rememberOnDuty(staff);
        setOnDuty(staff);
      })
      .catch(() => undefined);
  }, []);

  const changePin = (value: string) => {
    setPin(value);
    if (selected && workspace && value.length === PIN_LENGTH && !busy) {
      void submit(selected, value, workspace);
    }
  };

  const submit = async (staff: StaffLoginTile, enteredPin: string, chosen: Workspace) => {
    setBusy(true);
    setError(null);
    try {
      // Fast path: when this iPad already knows the PIN, check it here, clock in here if needed and open
      // straight away. The server sign-in (and the clock-in upload) then happens in the background.
      const local = await loginOffline(staff.id, enteredPin);
      if (local) {
        if (local.role !== 'ADMIN' && chosen === 'register' && !(await localOnDuty()).some((entry) => entry.staffId === staff.id)) {
          await recordClockIn(staff.id, local.fullName);
        }

        enter(local, chosen);
        if (connectivity !== 'offline') {
          void confirmWithServer(staff.id, enteredPin, chosen);
        }
        return;
      }

      // First sign-in on this iPad (or a changed PIN): the server has to check it.
      const session = await authenticate(staff, enteredPin, chosen);
      if (session) {
        enter(session, chosen);
      }
    } finally {
      setPin('');
      setBusy(false);
    }
  };

  const authenticate = async (staff: StaffLoginTile, enteredPin: string, chosen: Workspace): Promise<StaffSession | null> => {
    if (connectivity !== 'offline') {
      try {
        return await signInOnline(staff, enteredPin, chosen);
      } catch (loginError) {
        if (!(loginError instanceof NetworkError)) {
          setError(loginError instanceof ApiError && loginError.status === 401 ? 'Wrong PIN. Try again.' : describeError(loginError));
          return null;
        }
      }
    }

    const offlineSession = await loginOffline(staff.id, enteredPin);
    if (!offlineSession) {
      setError(`Offline sign-in failed. Either the PIN is wrong, or ${staff.fullName} has not signed in on this iPad while online before.`);
      return null;
    }

    // The same "clocked in to use the register" rule as online: the PIN just entered clocks them in on this iPad.
    if (offlineSession.role !== 'ADMIN' && chosen === 'register' && !(await localOnDuty()).some((entry) => entry.staffId === staff.id)) {
      await clockOffline(staff.id, enteredPin);
    }

    return offlineSession;
  };

  // Signing in to the register needs you clocked in, so a refusal for that clocks you in with the same PIN and tries again.
  const signInOnline = async (staff: StaffLoginTile, enteredPin: string, chosen: Workspace): Promise<StaffSession> => {
    const attempt = async () => {
      const pending = await pendingClockEventsFor(staff.id);
      const session = await loginOnline(staff.id, enteredPin, pending, chosen === 'system');
      await forgetClockEvents(pending.map((event) => event.id));
      return session;
    };

    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 403 && chosen === 'register')) {
        throw error;
      }

      await clockIn(staff.id, enteredPin);
      return await attempt();
    }
  };

  // One header for both modes: logo, what this screen is for, and the Sign in / Clock in switch.
  const header = (
    <View style={styles.header}>
      <BrandWordmark height={48} />
      <Text style={styles.title}>{mode === 'signin' ? 'Who is working?' : 'Clock in or out'}</Text>
      <View style={styles.modeBar}>
      {(['signin', 'clock'] as Mode[]).map((option) => (
        <Pressable
          key={option}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === option }}
          onPress={() => {
            setMode(option);
            setError(null);
          }}
          style={[styles.modeTab, mode === option && styles.modeTabActive]}>
          <Text style={[styles.modeText, mode === option && styles.modeTextActive]}>{option === 'signin' ? 'Sign in' : 'Clock in / out'}</Text>
        </Pressable>
      ))}
      </View>
    </View>
  );

  if (mode === 'clock') {
    return (
      <SafeAreaView style={styles.screen}>
        {header}
        <ClockPanel
          tiles={tiles}
          preselectedId={selected?.id}
          onClockedIn={(staff, clockPin) => {
            // Just clocked in, so they are starting work: open the register for them.
            setMode('signin');
            setSelected(staff);
            setWorkspace('register');
            void submit(staff, clockPin, 'register');
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {header}
      <View style={styles.layout}>
        <View style={styles.staffPane}>
          {loginNotice ? <Banner tone="danger" message={loginNotice} /> : null}
          {connectivity === 'offline' ? (
            <Banner tone="warning" message="Offline — only staff who signed in on this iPad before can sign in." />
          ) : null}
          <ScrollView contentContainerStyle={styles.tiles}>
            {tiles.map((tile) => {
              const active = selected?.id === tile.id;
              return (
                <Pressable
                  key={tile.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setSelected(tile);
                    setWorkspace(tile.role === 'BARISTA' ? 'register' : null);
                    setPin('');
                    setError(null);
                  }}
                  style={[styles.tile, active && styles.tileActive]}>
                  <Text style={styles.tileName}>{tile.fullName}</Text>
                  <Text style={styles.tileRole}>{ROLE_LABELS[tile.role]}</Text>
                </Pressable>
              );
            })}
            {tiles.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No staff list yet. Check the server address and internet connection.</Text>
                <Button label="Device setup" variant="secondary" onPress={() => router.push('/setup')} />
              </View>
            ) : null}
          </ScrollView>
        </View>

        <View style={styles.pinPane}>
          {selected && !workspace ? (
            <>
              <Text style={styles.pinTitle}>{selected.fullName}</Text>
              <Text style={styles.pinSubtitle}>What do you want to open?</Text>
              <Pressable accessibilityRole="button" onPress={() => setWorkspace('register')} style={styles.choice}>
                <Text style={styles.choiceTitle}>Open the register</Text>
                <Text style={styles.choiceText}>Take orders and payments, plus everything else. You must be clocked in (except the admin).</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setWorkspace('system')} style={styles.choice}>
                <Text style={styles.choiceTitle}>View the system</Text>
                <Text style={styles.choiceText}>Reports, orders, stock, shifts, staff and admin, without the Register and Website. No clock-in needed.</Text>
              </Pressable>
            </>
          ) : selected ? (
            <>
              <Text style={styles.pinTitle}>{selected.fullName}</Text>
              <Text style={styles.pinSubtitle}>
                {selected.role === 'BARISTA' ? 'Enter your 6-digit PIN' : `Enter your 6-digit PIN to ${workspace === 'system' ? 'view the system' : 'open the register'}`}
              </Text>
              {workspace === 'register' && selected.role !== 'ADMIN' && !onDuty.some((entry) => entry.staffId === selected.id) ? (
                <Text style={styles.clockNote}>Not clocked in yet: your PIN clocks you in and opens the register.</Text>
              ) : null}
              {selected.role !== 'BARISTA' ? (
                <Button
                  label="Change"
                  variant="ghost"
                  onPress={() => {
                    setWorkspace(null);
                    setPin('');
                    setError(null);
                  }}
                />
              ) : null}
              <PinPad value={pin} onChange={changePin} disabled={busy} />
              {error ? <Banner tone="danger" message={error} /> : null}
            </>
          ) : (
            <>
              <BrandCharacter height={180} tint={colors.accent} />
              <Text style={styles.pinSubtitle}>Tap your name to sign in. If you are starting your shift, signing in clocks you in.</Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xl, paddingHorizontal: space.xxl, paddingVertical: space.md, backgroundColor: colors.primary },
  modeBar: { flexDirection: 'row', gap: 4, marginLeft: 'auto', padding: 4, borderRadius: radius.md, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  modeTab: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.sm, justifyContent: 'center' },
  modeTabActive: { backgroundColor: colors.surface },
  modeText: { fontSize: font.body, fontWeight: '700', color: 'rgba(255, 255, 255, 0.78)' },
  modeTextActive: { color: colors.primary },
  layout: { flex: 1, flexDirection: 'row' },
  staffPane: { flex: 3, padding: space.xxl, gap: space.lg },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  title: { fontSize: font.title, fontWeight: '700', color: colors.onPrimary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    width: 200,
    minHeight: 96,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  tileName: { fontSize: font.large, fontWeight: '700', color: colors.text },
  tileRole: { fontSize: font.small, color: colors.textMuted, marginTop: space.xs },
  empty: { gap: space.md, maxWidth: 420 },
  emptyText: { fontSize: font.body, color: colors.textMuted },
  pinPane: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xl,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  choice: {
    width: '100%',
    maxWidth: 420,
    padding: space.lg,
    gap: space.xs,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  choiceTitle: { fontSize: font.large, fontWeight: '700', color: colors.text },
  choiceText: { fontSize: font.small, color: colors.textMuted },
  pinTitle: { fontSize: font.title, fontWeight: '700', color: colors.text },
  pinSubtitle: { fontSize: font.body, color: colors.textMuted, textAlign: 'center' },
  clockNote: {
    fontSize: font.body,
    fontWeight: '600',
    color: colors.success,
    textAlign: 'center',
    backgroundColor: colors.successSoft,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
});
