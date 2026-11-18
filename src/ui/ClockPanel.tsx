import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, describeError, NetworkError } from '@/lib/api';
import { clockIn, clockOut, fetchOnDuty, formatDuration, type OnDutyStaff } from '@/lib/attendance';
import { clockOffline, localOnDuty, rememberOnDuty } from '@/lib/offlineClock';
import { formatClock } from '@/lib/businessDay';
import type { StaffLoginTile } from '@/lib/types';
import { Banner } from '@/ui/Banner';
import { PIN_LENGTH, PinPad } from '@/ui/PinPad';
import { colors, font, radius, space } from '@/ui/theme';

type Feedback = { tone: 'success' | 'danger' | 'warning'; message: string } | null;

/**
 * Pick your name and enter your PIN: clocks you in, or out if you are already on duty.
 * Needs the internet, because the times are recorded on the server.
 */
export function ClockPanel({ tiles, preselectedId, onClockedIn }: {
  tiles: StaffLoginTile[];
  preselectedId?: string | null;
  /** On the start screen: a clock-in goes straight on to sign that person in with the same PIN. */
  onClockedIn?: (staff: StaffLoginTile, pin: string) => void;
}) {
  const [onDuty, setOnDuty] = useState<OnDutyStaff[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(preselectedId ?? null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // The server's list when online (remembered for later), otherwise what this iPad knows.
  const loadOnDuty = useCallback(async () => {
    try {
      const staff = await fetchOnDuty();
      await rememberOnDuty(staff);
      return { staff, offline: false };
    } catch (error) {
      if (error instanceof NetworkError) {
        return { staff: await localOnDuty(), offline: true };
      }

      throw error;
    }
  }, []);

  const refresh = useCallback(() => loadOnDuty().then((result) => setOnDuty(result.staff)), [loadOnDuty]);

  useEffect(() => {
    let active = true;
    loadOnDuty()
      .then((result) => {
        if (active) {
          setOnDuty(result.staff);
          if (result.offline) {
            setFeedback({ tone: 'warning', message: 'No internet: clock-ins are saved on this iPad and sent when the connection is back.' });
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [loadOnDuty]);

  const selected = tiles.find((tile) => tile.id === selectedId) ?? null;
  const shift = selected ? onDuty.find((entry) => entry.staffId === selected.id) : undefined;

  const submit = async (staff: StaffLoginTile, enteredPin: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      if (onDuty.some((entry) => entry.staffId === staff.id)) {
        const result = await clockOut(staff.id, enteredPin);
        setFeedback({ tone: 'success', message: `${result.fullName} clocked out. Worked ${formatDuration(result.minutesWorked)} today.` });
      } else if (onClockedIn) {
        // The start screen clocks in and signs in at once, on this iPad first (see login.tsx).
        onClockedIn(staff, enteredPin);
        return;
      } else {
        const result = await clockIn(staff.id, enteredPin);
        setFeedback({ tone: 'success', message: `${result.fullName} clocked in at ${formatClock(result.clockInAt)}. You can sign in now.` });
      }

      setSelectedId(null);
      await refresh().catch(() => undefined);
    } catch (error) {
      if (error instanceof NetworkError) {
        await submitOffline(staff, enteredPin);
        return;
      }

      setFeedback({
        tone: 'danger',
        message:
          error instanceof ApiError && error.status === 401
              ? 'Wrong PIN. Try again.'
              : describeError(error),
      });
    } finally {
      setPin('');
      setBusy(false);
    }
  };

  const submitOffline = async (staff: StaffLoginTile, enteredPin: string) => {
    const event = await clockOffline(staff.id, enteredPin);
    if (!event) {
      setFeedback({
        tone: 'danger',
        message: `No internet, and this iPad can't check the PIN: it's wrong, or ${staff.fullName} has never signed in on this iPad while online.`,
      });
      return;
    }

    if (event.kind === 'IN' && onClockedIn) {
      onClockedIn(staff, enteredPin);
      return;
    }

    setFeedback({
      tone: 'success',
      message: `${event.fullName} clocked ${event.kind === 'IN' ? 'in' : 'out'} at ${formatClock(event.occurredAt)} (offline). It will be sent when the internet is back.`,
    });
    setSelectedId(null);
    setOnDuty(await localOnDuty());
  };

  const changePin = (value: string) => {
    setPin(value);
    if (selected && value.length === PIN_LENGTH && !busy) {
      void submit(selected, value);
    }
  };

  return (
    <View style={styles.layout}>
      <ScrollView style={styles.staffPane} contentContainerStyle={styles.tiles}>
        {tiles.map((tile) => {
          const entry = onDuty.find((candidate) => candidate.staffId === tile.id);
          const active = tile.id === selectedId;
          return (
            <Pressable
              key={tile.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setSelectedId(tile.id);
                setPin('');
                setFeedback(null);
              }}
              style={[styles.tile, entry && styles.tileOnDuty, active && styles.tileActive]}>
              <Text style={styles.tileName}>{tile.fullName}</Text>
              <Text style={[styles.tileStatus, entry && styles.tileStatusOnDuty]}>
                {entry ? `On duty since ${formatClock(entry.clockInAt)}` : 'Not clocked in'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.pinPane}>
        {selected ? (
          <>
            <Text style={styles.action}>{shift ? 'Clock out' : 'Clock in'}</Text>
            <Text style={styles.pinTitle}>{selected.fullName}</Text>
            <Text style={styles.pinSubtitle}>
              {shift ? `On duty since ${formatClock(shift.clockInAt)}. Enter your PIN to clock out.` : 'Enter your PIN to start your shift.'}
            </Text>
            <PinPad value={pin} onChange={changePin} disabled={busy} />
          </>
        ) : (
          <Text style={styles.pinSubtitle}>Tap your name to clock in or out.</Text>
        )}
        {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row' },
  staffPane: { flex: 3 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, padding: space.xl },
  tile: {
    width: 200,
    minHeight: 96,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    gap: space.xs,
  },
  tileOnDuty: { borderColor: colors.success },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  tileName: { fontSize: font.large, fontWeight: '700', color: colors.text },
  tileStatus: { fontSize: font.small, color: colors.textMuted },
  tileStatusOnDuty: { color: colors.success, fontWeight: '700' },
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
  action: { fontSize: font.small, fontWeight: '800', color: colors.primary, letterSpacing: 1, textTransform: 'uppercase' },
  pinTitle: { fontSize: font.title, fontWeight: '700', color: colors.text },
  pinSubtitle: { fontSize: font.body, color: colors.textMuted, textAlign: 'center' },
});
