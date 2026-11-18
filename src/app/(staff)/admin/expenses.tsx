import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';

import { createRecurring, loadExpenses, loadRecurring, recordExpense, updateRecurring } from '@/lib/admin';
import { addDays, isBusinessDate, todayBusinessDate } from '@/lib/businessDay';
import { formatEgp, parseMoneyInput, toEgp, toPiastres } from '@/lib/money';
import { uploadReceiptImage } from '@/lib/receipts';
import type { Expense, ExpenseCategory, ExpensePaymentSource, RecurringFrequency, RecurringOverhead } from '@/lib/types';
import { ChipSelect, EmptyState, formStyles, FormRow, ListRow, Panel, Segments, ToggleRow } from '@/ui/admin/AdminKit';
import {
  EXPENSE_CATEGORY_LABELS,
  FREQUENCY_LABELS,
  MANUAL_EXPENSE_SOURCES,
  optionsOf,
  PAYMENT_SOURCE_LABELS,
} from '@/ui/admin/labels';
import { errorMessage } from '@/ui/admin/MenuForms';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { colors, font, radius, space } from '@/ui/theme';

type Mode = 'expenses' | 'recurring';
type Range = 'today' | 'week' | 'month';
type Feedback = { tone: 'success' | 'danger'; message: string } | null;

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
];

function rangeDates(range: Range): { from: string; to: string } {
  const today = todayBusinessDate();
  if (range === 'today') {
    return { from: today, to: today };
  }

  return { from: range === 'week' ? addDays(today, -6) : `${today.slice(0, 8)}01`, to: today };
}

function parseAmount(text: string): number {
  const piastres = parseMoneyInput(text);
  if (piastres === null || piastres <= 0) {
    throw new Error('Amount must be more than zero, like 250 or 99.50.');
  }

  return toEgp(piastres);
}

const egp = (amount: number) => formatEgp(toPiastres(amount));

const PERIOD_LABELS: Record<RecurringFrequency, string> = { DAILY: 'today', WEEKLY: 'this week', MONTHLY: 'this month', YEARLY: 'this year' };

/** Whether this period's payment has been made: what is left to pay and a badge for the list. */
function paymentStatus(overhead: RecurringOverhead) {
  const left = Math.max(0, toPiastres(overhead.amount) - toPiastres(overhead.paidThisPeriod));
  if (!overhead.isActive || (overhead.effectiveUntil !== null && overhead.effectiveUntil < todayBusinessDate())) {
    return { left: 0, badge: 'Stopped', tone: 'muted' as const };
  }

  if (overhead.effectiveFrom > todayBusinessDate()) {
    return { left: 0, badge: 'Not started', tone: 'muted' as const };
  }

  // Salaries are counted in expenses automatically every month; their payment is not recorded.
  if (overhead.staffUserId) {
    return { left: 0, badge: 'Auto', tone: 'accent' as const };
  }

  if (left === 0) {
    return { left, badge: 'Paid', tone: 'success' as const };
  }

  return { left, badge: overhead.paidThisPeriod > 0 ? `${formatEgp(left)} due` : 'Due', tone: 'danger' as const };
}

export default function ExpensesAdminScreen() {
  const [mode, setMode] = useState<Mode>('expenses');
  const [range, setRange] = useState<Range>('month');
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [recurring, setRecurring] = useState<RecurringOverhead[]>([]);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  // The recurring cost being paid, which fills in the expense form.
  const [paying, setPaying] = useState<RecurringOverhead | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const fail = useCallback((error: unknown) => setFeedback({ tone: 'danger', message: errorMessage(error) }), []);

  const reload = useCallback(
    async (nextRange: Range) => {
      try {
        const { from, to } = rangeDates(nextRange);
        const [loadedExpenses, loadedRecurring] = await Promise.all([loadExpenses(from, to), loadRecurring()]);
        setExpenses(loadedExpenses);
        setRecurring(loadedRecurring);
      } catch (error) {
        fail(error);
      }
    },
    [fail],
  );

  useEffect(() => {
    let active = true;
    const { from, to } = rangeDates(range);
    Promise.all([loadExpenses(from, to), loadRecurring()])
      .then(([loadedExpenses, loadedRecurring]) => {
        if (active) {
          setExpenses(loadedExpenses);
          setRecurring(loadedRecurring);
        }
      })
      .catch((error) => active && fail(error));
    return () => {
      active = false;
    };
  }, [range, fail]);

  const open = (id: string | 'new' | null) => {
    setSelected(id);
    setPaying(null);
    setFeedback(null);
  };

  const pay = (overhead: RecurringOverhead) => {
    setMode('expenses');
    setSelected('new');
    setPaying(overhead);
    setFeedback(null);
  };

  const saved = (id: string, message: string) => {
    void reload(range);
    setSelected(id);
    setFeedback({ tone: 'success', message });
  };

  const sortedExpenses = [...(expenses ?? [])].sort((a, b) => b.incurredDate.localeCompare(a.incurredDate) || b.createdAt.localeCompare(a.createdAt));
  const total = sortedExpenses.reduce((sum, expense) => sum + toPiastres(expense.amount), 0);
  const expense = mode === 'expenses' && selected && selected !== 'new' ? sortedExpenses.find((candidate) => candidate.id === selected) ?? null : null;
  const overhead = mode === 'recurring' && selected && selected !== 'new' ? recurring.find((candidate) => candidate.id === selected) ?? null : null;

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Segments
          options={[
            { value: 'expenses', label: 'Expenses' },
            { value: 'recurring', label: 'Recurring costs' },
          ]}
          value={mode}
          onChange={(value: Mode) => {
            setMode(value);
            open(null);
          }}
        />
        {mode === 'expenses' ? <Segments options={RANGES} value={range} onChange={setRange} /> : null}
      </View>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      <View style={styles.columns}>
        {mode === 'expenses' ? (
          <Panel
            title={`Expenses · ${formatEgp(total)}`}
            style={styles.list}
            action={<Button label="+ Record expense" onPress={() => open('new')} />}>
            {sortedExpenses.map((candidate) => (
              <ListRow
                key={candidate.id}
                title={`${candidate.title} · ${egp(candidate.amount)}`}
                subtitle={`${candidate.incurredDate} · ${EXPENSE_CATEGORY_LABELS[candidate.category]} · ${PAYMENT_SOURCE_LABELS[candidate.paymentSource]}`}
                badge={candidate.receiptImageUrl ? 'Receipt' : candidate.shiftCashMovementId ? 'Payout' : null}
                badgeTone="muted"
                selected={candidate.id === selected}
                onPress={() => open(candidate.id)}
              />
            ))}
            {expenses?.length === 0 ? <EmptyState message="No expenses in this period." /> : null}
          </Panel>
        ) : (
          <Panel title="Recurring costs" style={styles.list} action={<Button label="+ New recurring cost" onPress={() => open('new')} />}>
            {recurring.map((candidate) => (
              <ListRow
                key={candidate.id}
                title={`${candidate.title} · ${egp(candidate.amount)}`}
                subtitle={`${candidate.staffUserId ? 'Staff salary · ' : ''}${FREQUENCY_LABELS[candidate.frequency]} · ${EXPENSE_CATEGORY_LABELS[candidate.category]} · from ${candidate.effectiveFrom}${
                  candidate.effectiveUntil ? ` to ${candidate.effectiveUntil}` : ''
                }`}
                badge={paymentStatus(candidate).badge}
                badgeTone={paymentStatus(candidate).tone}
                selected={candidate.id === selected}
                onPress={() => open(candidate.id)}
              />
            ))}
            {recurring.length === 0 ? (
              <EmptyState message="Add fixed costs like rent. Salaries are added automatically from Admin → Staff. Reports spread them over each day to show your real profit." />
            ) : null}
          </Panel>
        )}

        <View style={styles.editor}>
          {mode === 'expenses' && selected === 'new' ? (
            <ExpenseForm key={paying?.id ?? 'new'} recurring={recurring} paying={paying} onSaved={saved} onError={fail} />
          ) : mode === 'expenses' && expense ? (
            <ExpenseDetails expense={expense} />
          ) : mode === 'recurring' && selected === 'new' ? (
            <NewRecurringForm onSaved={saved} onError={fail} />
          ) : mode === 'recurring' && overhead ? (
            <RecurringDetails key={overhead.id} overhead={overhead} onPay={() => pay(overhead)} onSaved={saved} onError={fail} />
          ) : (
            <Panel>
              <EmptyState
                message={
                  mode === 'expenses'
                    ? 'Record bills paid from outside the drawer here. Cash taken from the drawer is recorded as a payout on the Shift tab.'
                    : 'Pick a recurring cost to pay it, or to see or stop it.'
                }
              />
            </Panel>
          )}
        </View>
      </View>
    </View>
  );
}

function ExpenseForm({ recurring, paying, onSaved, onError }: {
  recurring: RecurringOverhead[];
  /** Paying this recurring cost: its name, category, what is left this period and the link are filled in. */
  paying: RecurringOverhead | null;
  onSaved: (id: string, message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [title, setTitle] = useState(paying?.title ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(paying?.category ?? 'MAINTENANCE_REPAIRS');
  const [amount, setAmount] = useState(paying ? String(toEgp(paymentStatus(paying).left || toPiastres(paying.amount))) : '');
  const [source, setSource] = useState<ExpensePaymentSource>('OWNER_CASH');
  const [date, setDate] = useState(todayBusinessDate());
  const [invoice, setInvoice] = useState('');
  const [notes, setNotes] = useState('');
  const [recurringId, setRecurringId] = useState<string | null>(paying?.id ?? null);
  const [receipt, setReceipt] = useState<{ localUri: string; url: string | null } | null>(null);
  const [busy, setBusy] = useState<'save' | 'photo' | null>(null);

  const matchingRecurring = recurring.filter((candidate) => candidate.isActive && !candidate.staffUserId && candidate.category === category);

  const attach = async (from: 'camera' | 'library') => {
    try {
      const permission = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error(from === 'camera' ? 'Camera access was not allowed.' : 'Photo access was not allowed.');
      }

      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
      const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      setReceipt({ localUri: asset.uri, url: null });
      setBusy('photo');
      const url = await uploadReceiptImage(asset);
      setReceipt({ localUri: asset.uri, url });
    } catch (error) {
      setReceipt(null);
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      if (!isBusinessDate(date)) {
        throw new Error('The date must look like 2026-11-30.');
      }

      const saved = await recordExpense({
        title: title.trim(),
        category,
        amount: parseAmount(amount),
        paymentSource: source,
        incurredDate: date.trim(),
        recurringExpenseId: recurringId,
        invoiceNumber: invoice.trim() || null,
        receiptImageUrl: receipt?.url ?? null,
        notes: notes.trim() || null,
      });
      onSaved(saved.id, `"${saved.title}" (${egp(saved.amount)}) was recorded.`);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title={paying ? `Pay ${paying.title}` : 'Record an expense'}>
      <Field label="What was it for?" value={title} onChangeText={setTitle} placeholder="Plumber for the sink" />
      <ChipSelect
        label="Category"
        options={optionsOf(EXPENSE_CATEGORY_LABELS)}
        selected={[category]}
        onToggle={(value) => {
          setCategory(value);
          setRecurringId(null);
        }}
      />
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="Amount (EGP)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        </View>
        <View style={formStyles.grow}>
          <Field label="Date" value={date} onChangeText={setDate} placeholder="2026-11-30" autoCorrect={false} />
        </View>
        <View style={formStyles.grow}>
          <Field label="Invoice number (optional)" value={invoice} onChangeText={setInvoice} />
        </View>
      </FormRow>
      <ChipSelect label="Paid with" options={optionsOf(PAYMENT_SOURCE_LABELS, MANUAL_EXPENSE_SOURCES)} selected={[source]} onToggle={setSource} />
      {matchingRecurring.length > 0 ? (
        <ChipSelect
          label="Is this a payment of a recurring cost? (optional)"
          options={matchingRecurring.map((candidate) => ({ value: candidate.id, label: candidate.title }))}
          selected={recurringId ? [recurringId] : []}
          onToggle={(value) => setRecurringId((current) => (current === value ? null : value))}
        />
      ) : null}
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />

      <Text style={styles.label}>Receipt photo (optional)</Text>
      <View style={styles.receiptRow}>
        {receipt ? <Image source={{ uri: receipt.localUri }} style={styles.thumb} /> : null}
        <View style={styles.receiptActions}>
          <Button label="Take photo" variant="secondary" onPress={() => void attach('camera')} busy={busy === 'photo'} />
          <Button label="Choose photo" variant="secondary" onPress={() => void attach('library')} disabled={busy === 'photo'} />
          {receipt ? <Text style={styles.hint}>{receipt.url ? 'Uploaded.' : 'Uploading…'}</Text> : null}
        </View>
      </View>

      <Button label="Save expense" onPress={() => void save()} busy={busy === 'save'} disabled={busy === 'photo'} large />
    </Panel>
  );
}

function ExpenseDetails({ expense }: { expense: Expense }) {
  const rows: [string, string | null][] = [
    ['Amount', egp(expense.amount)],
    ['Date', expense.incurredDate],
    ['Category', EXPENSE_CATEGORY_LABELS[expense.category]],
    ['Paid with', PAYMENT_SOURCE_LABELS[expense.paymentSource]],
    ['Recorded by', expense.authorizedByName],
    ['Recurring cost', expense.recurringExpenseTitle],
    ['Invoice', expense.invoiceNumber],
    ['Notes', expense.notes],
    ['From', expense.shiftCashMovementId ? 'Payout on a shift' : null],
  ];

  return (
    <Panel title={expense.title}>
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <View key={label} style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue}>{value}</Text>
          </View>
        ))}
      {expense.receiptImageUrl ? (
        <>
          <Image source={{ uri: expense.receiptImageUrl }} style={styles.receipt} resizeMode="contain" />
          <Button label="Open full receipt" variant="secondary" onPress={() => void Linking.openURL(expense.receiptImageUrl!)} />
        </>
      ) : null}
      <Text style={styles.hint}>Expenses cannot be changed after saving, so check the amount and date before you save.</Text>
    </Panel>
  );
}

function NewRecurringForm({ onSaved, onError }: { onSaved: (id: string, message: string) => void; onError: (error: unknown) => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('MONTHLY');
  const [from, setFrom] = useState(`${todayBusinessDate().slice(0, 8)}01`);
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (!isBusinessDate(from) || (until.trim() && !isBusinessDate(until))) {
        throw new Error('Dates must look like 2026-11-30.');
      }

      const saved = await createRecurring({
        title: title.trim(),
        category,
        amount: parseAmount(amount),
        frequency,
        effectiveFrom: from.trim(),
        effectiveUntil: until.trim() || null,
      });
      onSaved(saved.id, `"${saved.title}" was added.`);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="New recurring cost">
      <Field label="Name" value={title} onChangeText={setTitle} placeholder="Shop rent" />
      <ChipSelect label="Category" options={optionsOf(EXPENSE_CATEGORY_LABELS)} selected={[category]} onToggle={setCategory} />
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="Amount each time (EGP)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        </View>
        <View style={formStyles.grow}>
          <Field label="Starts on" value={from} onChangeText={setFrom} autoCorrect={false} />
        </View>
        <View style={formStyles.grow}>
          <Field label="Ends on (optional)" value={until} onChangeText={setUntil} placeholder="2027-12-31" autoCorrect={false} />
        </View>
      </FormRow>
      <ChipSelect label="How often" options={optionsOf(FREQUENCY_LABELS)} selected={[frequency]} onToggle={setFrequency} />
      <Text style={styles.hint}>
        Reports spread this cost evenly over each day, so the daily break-even target includes it. Each time it is due it shows in the list;
        record the payment (and how it was paid) from there.
      </Text>
      <Button label="Add recurring cost" onPress={() => void save()} busy={busy} large />
    </Panel>
  );
}

function RecurringDetails({ overhead, onPay, onSaved, onError }: {
  overhead: RecurringOverhead;
  onPay: () => void;
  onSaved: (id: string, message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [until, setUntil] = useState(overhead.effectiveUntil ?? '');
  const [isActive, setIsActive] = useState(overhead.isActive);
  const [busy, setBusy] = useState(false);
  const status = paymentStatus(overhead);

  const save = async () => {
    setBusy(true);
    try {
      if (until.trim() && !isBusinessDate(until)) {
        throw new Error('The end date must look like 2026-11-30.');
      }

      const saved = await updateRecurring(overhead.id, { effectiveUntil: until.trim() || null, isActive });
      onSaved(saved.id, `"${saved.title}" was updated.`);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={overhead.title}>
      <Text style={styles.detailValue}>
        {egp(overhead.amount)} · {FREQUENCY_LABELS[overhead.frequency]} · {EXPENSE_CATEGORY_LABELS[overhead.category]}
      </Text>
      <Text style={[styles.detailValue, { color: status.tone === 'danger' ? colors.danger : status.tone === 'success' ? colors.success : colors.textMuted }]}>
        {status.badge === 'Paid'
          ? `Paid ${PERIOD_LABELS[overhead.frequency]} (${egp(overhead.paidThisPeriod)}).`
          : status.tone === 'danger'
            ? `${formatEgp(status.left)} still to pay ${PERIOD_LABELS[overhead.frequency]}${overhead.paidThisPeriod > 0 ? ` (${egp(overhead.paidThisPeriod)} paid)` : ''}.`
            : overhead.staffUserId && status.badge === 'Auto'
              ? 'Counted in expenses automatically every month. No need to record the payment.'
              : status.badge}
      </Text>
      {status.left > 0 ? <Button label={`Record payment · ${formatEgp(status.left)}`} onPress={onPay} large /> : null}
      {overhead.staffUserId ? (
        <Text style={styles.hint}>
          This is a staff salary, added automatically from Admin → Staff. To change the amount or stop it, edit the salary or switch the person off there.
        </Text>
      ) : (
        <>
          <Text style={styles.hint}>Started {overhead.effectiveFrom}. The amount and schedule cannot be changed; end this one and add a new cost instead.</Text>
          <Field label="Ends on (optional)" value={until} onChangeText={setUntil} placeholder="2027-12-31" autoCorrect={false} />
          <ToggleRow label="Active" hint="Stopped costs no longer count in reports." value={isActive} onChange={setIsActive} />
          <Button label="Save" variant="secondary" onPress={() => void save()} busy={busy} />
        </>
      )}

    </Panel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { width: 440 },
  editor: { flex: 1 },
  label: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  hint: { fontSize: font.small, color: colors.textMuted },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  receiptActions: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  thumb: { width: 72, height: 96, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  receipt: { width: '100%', height: 320, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  detailRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { width: 140, fontSize: font.body, color: colors.textMuted },
  detailValue: { flex: 1, fontSize: font.body, color: colors.text },
});
