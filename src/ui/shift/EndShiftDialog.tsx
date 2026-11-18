import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiRequest, describeError, NetworkError } from '@/lib/api';
import { formatEgp, toPiastres } from '@/lib/money';
import { printShiftReport } from '@/lib/orderActions';
import { rememberShift } from '@/lib/shift';
import type { CurrentShift } from '@/lib/types';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { dialogStyles } from '@/ui/orders/CancelDialog';
import { colors, font, radius, space } from '@/ui/theme';

import { CashCounter, countTotal, type CashCount } from './CashCounter';

type Step = 'checks' | 'count' | 'review' | 'done';

const STEPS: { step: Exclude<Step, 'done'>; label: string }[] = [
  { step: 'checks', label: '1. Checks' },
  { step: 'count', label: '2. Count the drawer' },
  { step: 'review', label: '3. Review & close' },
];

/**
 * Closing the drawer as a guided flow: make sure nothing is left open, count the cash note by note,
 * then see the difference (managers) before confirming. Baristas count blind.
 */
export function EndShiftDialog({ shift, unsyncedCount, onRecheck, onClose, onClosed }: {
  shift: CurrentShift;
  unsyncedCount: number;
  onRecheck: () => Promise<void>;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [step, setStep] = useState<Step>('checks');
  const [count, setCount] = useState<CashCount>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ variance: number | null; printMessage: string } | null>(null);

  const counted = countTotal(count);
  const expected = shift.totals ? toPiastres(shift.totals.expectedCash) : null;
  const difference = expected === null ? null : counted - expected;
  const blockers = [
    ...(unsyncedCount > 0 ? [`${unsyncedCount} order(s) on this iPad have not synced yet. Wait for them to sync.`] : []),
    ...(shift.unfinishedPosOrders.length > 0
      ? [`Finish or cancel these register orders: ${shift.unfinishedPosOrders.join(', ')}.`]
      : []),
  ];

  const recheck = async () => {
    setBusy(true);
    setError(null);
    try {
      await onRecheck();
    } catch (recheckError) {
      setError(describeError(recheckError));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (difference !== null && difference !== 0 && !notes.trim()) {
      setError(`The drawer is ${difference > 0 ? 'over' : 'short'}. Add a note explaining why.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const closed = await apiRequest<{ cashVariance: number | null }>('POST', '/api/v1/shifts/close', {
        body: { countedCash: counted / 100, shiftNotes: notes.trim() || null },
      });
      await rememberShift(null);

      let printMessage = 'The shift report was printed.';
      try {
        await printShiftReport(shift.id);
      } catch (printError) {
        printMessage = `The report did not print: ${describeError(printError)} You can reprint it from the shift history.`;
      }

      setResult({ variance: closed.cashVariance === null ? null : toPiastres(closed.cashVariance), printMessage });
      setStep('done');
    } catch (closeError) {
      setError(closeError instanceof NetworkError ? 'Closing needs the internet. Try again when back online.' : describeError(closeError));
    } finally {
      setBusy(false);
    }
  };

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={step === 'done' ? onClosed : onClose}>
      <View style={dialogStyles.backdrop}>
        <View style={[dialogStyles.dialog, styles.dialog]}>
          <Text style={dialogStyles.title}>End shift</Text>
          {step !== 'done' ? (
            <View style={styles.steps}>
              {STEPS.map(({ step: candidate, label }) => (
                <Text key={candidate} style={[styles.stepLabel, candidate === step && styles.stepActive]}>
                  {label}
                </Text>
              ))}
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === 'checks' ? (
              blockers.length > 0 ? (
                blockers.map((message) => <Banner key={message} tone="warning" message={message} />)
              ) : (
                <Banner tone="success" message="All orders are finished and synced. Ready to count the drawer." />
              )
            ) : null}

            {step === 'count' ? (
              <>
                <Text style={dialogStyles.meta}>Count every note in the drawer, including the opening float.</Text>
                <CashCounter count={count} onChange={setCount} />
              </>
            ) : null}

            {step === 'review' ? (
              <View style={styles.review}>
                <Figure label="Counted cash" value={formatEgp(counted)} />
                {expected !== null && difference !== null ? (
                  <>
                    <Figure label="Expected in drawer" value={formatEgp(expected)} />
                    <View style={[styles.verdict, difference === 0 ? styles.balanced : styles.off]}>
                      <Text style={[styles.verdictText, { color: difference === 0 ? colors.success : colors.danger }]}>
                        {difference === 0 ? 'Drawer balanced' : `${difference > 0 ? 'Over' : 'Short'} by ${formatEgp(Math.abs(difference))}`}
                      </Text>
                    </View>
                  </>
                ) : null}
                <Field
                  label={difference !== null && difference !== 0 ? 'Note (required: why is it off?)' : 'Notes (optional)'}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              </View>
            ) : null}

            {step === 'done' && result ? (
              <View style={styles.review}>
                <Banner tone="success" message="Shift closed." />
                {result.variance !== null && shift.totals ? (
                  <Figure
                    label="Drawer"
                    value={result.variance === 0 ? 'Balanced' : `${result.variance > 0 ? 'Over' : 'Short'} ${formatEgp(Math.abs(result.variance))}`}
                  />
                ) : null}
                <Text style={dialogStyles.meta}>{result.printMessage}</Text>
              </View>
            ) : null}

            {error ? <Banner tone="danger" message={error} /> : null}
          </ScrollView>

          <View style={dialogStyles.actions}>
            {step === 'checks' ? (
              <>
                <Button label="Cancel" variant="secondary" onPress={onClose} style={dialogStyles.grow} />
                {blockers.length > 0 ? (
                  <Button label="Check again" onPress={() => void recheck()} busy={busy} style={dialogStyles.grow} />
                ) : (
                  <Button label="Count the drawer" onPress={() => go('count')} style={dialogStyles.grow} />
                )}
              </>
            ) : null}
            {step === 'count' ? (
              <>
                <Button label="Back" variant="secondary" onPress={() => go('checks')} style={dialogStyles.grow} />
                <Button label="Review" onPress={() => go('review')} style={dialogStyles.grow} />
              </>
            ) : null}
            {step === 'review' ? (
              <>
                <Button label="Back" variant="secondary" onPress={() => go('count')} disabled={busy} style={dialogStyles.grow} />
                <Button label="Close shift & print" variant="danger" onPress={() => void close()} busy={busy} style={dialogStyles.grow} />
              </>
            ) : null}
            {step === 'done' ? <Button label="Done" onPress={onClosed} style={dialogStyles.grow} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dialog: { width: 760, maxHeight: '92%' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stepLabel: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  stepActive: { color: colors.primary, textDecorationLine: 'underline' },
  body: { gap: space.md },
  review: { gap: space.md },
  figure: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  figureLabel: { fontSize: font.large, color: colors.text },
  figureValue: { fontSize: font.title, fontWeight: '700', color: colors.text },
  verdict: { padding: space.md, borderRadius: radius.md, alignItems: 'center' },
  balanced: { backgroundColor: colors.successSoft },
  off: { backgroundColor: colors.dangerSoft },
  verdictText: { fontSize: font.title, fontWeight: '700' },
});
