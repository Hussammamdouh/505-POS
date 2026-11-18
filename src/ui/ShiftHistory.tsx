import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiRequest, describeError, NetworkError } from '@/lib/api';
import { formatReceiptTime } from '@/lib/businessDay';
import { formatEgp, toPiastres } from '@/lib/money';
import { printShiftReport } from '@/lib/orderActions';
import type { ShiftListItem } from '@/lib/types';

import { Banner } from './Banner';
import { Button } from './Button';
import { colors, font, radius, space } from './theme';

const HISTORY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function ShiftHistory() {
  const [shifts, setShifts] = useState<ShiftListItem[] | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [days, setDays] = useState(HISTORY_DAYS);
  // How many days the list on screen covers; while it differs from `days`, more are loading.
  const [loadedDays, setLoadedDays] = useState(0);
  const loading = loadedDays !== days;

  useEffect(() => {
    let active = true;
    // No upper bound: shifts are stamped by the server's clock, and an iPad clock running a little behind
    // would otherwise hide a shift that was just opened and closed.
    const from = new Date(Date.now() - days * DAY_MS).toISOString();
    apiRequest<ShiftListItem[]>('GET', `/api/v1/shifts?from=${encodeURIComponent(from)}`)
      .then((loaded) => {
        if (active) {
          setShifts(loaded);
        }
      })
      .catch(
        (error) =>
          active && setFeedback({ tone: 'danger', message: error instanceof NetworkError ? 'Shift history needs the internet.' : describeError(error) }),
      )
      .finally(() => active && setLoadedDays(days));
    return () => {
      active = false;
    };
  }, [days]);

  const reprint = async (shiftId: string) => {
    setPrinting(shiftId);
    setFeedback(null);
    try {
      await printShiftReport(shiftId);
      setFeedback({ tone: 'success', message: 'Shift report printed.' });
    } catch (error) {
      setFeedback({ tone: 'danger', message: describeError(error) });
    } finally {
      setPrinting(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Last {days} days</Text>
      <Text style={styles.meta}>Tap a shift to see its orders and how they were paid.</Text>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
      {shifts?.length === 0 ? <Text style={styles.meta}>No shifts in this period.</Text> : null}
      {shifts?.map((shift) => {
        const variance = shift.cashVariance === null ? null : toPiastres(shift.cashVariance);
        const selected = shift.id === selectedId;
        return (
          <View key={shift.id} style={[styles.item, selected && styles.itemSelected]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: selected }}
            onPress={() => setSelectedId(selected ? null : shift.id)}
            style={styles.row}>
            <View style={styles.main}>
              <Text style={styles.name}>
                {shift.status === 'OPEN' ? 'Open now' : 'Closed'} · Opened by {shift.staffName}
                {shift.closedByName ? ` · Closed by ${shift.closedByName}` : ''}
              </Text>
              <Text style={styles.meta}>
                {formatReceiptTime(shift.openedAt)}
                {shift.closedAt ? ` → ${formatReceiptTime(shift.closedAt)}` : ''}
              </Text>
            </View>
            <View style={styles.figures}>
              <Text style={styles.name}>{formatEgp(toPiastres(shift.totals.allMethods.net))}</Text>
              {variance !== null ? (
                <Text style={[styles.variance, { color: variance === 0 ? colors.success : colors.danger }]}>
                  {variance === 0 ? 'Drawer balanced' : `${variance > 0 ? 'Over' : 'Short'} ${formatEgp(Math.abs(variance))}`}
                </Text>
              ) : null}
            </View>
          </Pressable>
            {selected ? (
              <View style={styles.actions}>
                <Button label="View full shift" onPress={() => router.push(`/shifts/${shift.id}` as Href)} />
                {shift.status === 'CLOSED' ? (
                  <Button label="Print report" variant="secondary" onPress={() => void reprint(shift.id)} busy={printing === shift.id} />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {shifts ? (
        <Button
          label={`Show ${HISTORY_DAYS} more days`}
          variant="secondary"
          onPress={() => setDays((current) => current + HISTORY_DAYS)}
          busy={loading}
          disabled={loading}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  item: { borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: radius.sm },
  itemSelected: { backgroundColor: colors.selected },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm, minHeight: 56 },
  actions: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.sm, paddingBottom: space.sm },
  main: { flex: 1, gap: 2 },
  figures: { alignItems: 'flex-end', gap: 2 },
  name: { fontSize: font.body, fontWeight: '600', color: colors.text },
  meta: { fontSize: font.small, color: colors.textMuted },
  variance: { fontSize: font.small, fontWeight: '700' },
});
