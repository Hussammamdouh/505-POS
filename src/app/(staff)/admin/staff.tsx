import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { createStaff, loadStaff, resetStaffPin, updateStaff } from '@/lib/admin';
import { describeError, NetworkError } from '@/lib/api';
import { isBusinessDate, todayBusinessDate } from '@/lib/businessDay';
import type { StaffRole, StaffSummary } from '@/lib/types';
import { formatEgp, parseMoneyInput } from '@/lib/money';
import { useApp } from '@/store/app';
import { ChipSelect, EmptyState, formStyles, FormRow, ListRow, Panel, ToggleRow } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { colors, font, space } from '@/ui/theme';

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'BARISTA', label: 'Barista' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ADMIN', label: 'Admin' },
];

const ROLE_LABEL: Record<StaffRole, string> = { BARISTA: 'Barista', MANAGER: 'Manager', ADMIN: 'Admin' };

const PIN_PATTERN = /^\d{6}$/;

type Feedback = { tone: 'success' | 'danger'; message: string } | null;

const errorMessage = (error: unknown) => (error instanceof NetworkError ? 'This needs the internet.' : describeError(error));

export default function StaffAdminScreen() {
  const myId = useApp((state) => state.session?.staffId);
  const [staff, setStaff] = useState<StaffSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const reload = useCallback(async () => {
    try {
      setStaff(await loadStaff());
    } catch (error) {
      setFeedback({ tone: 'danger', message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadStaff()
      .then((loaded) => active && setStaff(loaded))
      .catch((error) => active && setFeedback({ tone: 'danger', message: errorMessage(error) }));
    return () => {
      active = false;
    };
  }, []);

  const sorted = [...(staff ?? [])].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName));
  const selected = selectedId && selectedId !== 'new' ? staff?.find((member) => member.id === selectedId) ?? null : null;

  return (
    <View style={styles.screen}>
      <Panel
        title="Team"
        style={styles.list}
        action={<Button label="+ Add staff" onPress={() => { setSelectedId('new'); setFeedback(null); }} />}>
        {sorted.map((member) => (
          <ListRow
            key={member.id}
            title={member.fullName + (member.id === myId ? ' (you)' : '')}
            subtitle={member.phone}
            badge={member.isActive ? ROLE_LABEL[member.role] : 'Inactive'}
            badgeTone={member.isActive ? (member.role === 'ADMIN' ? 'accent' : 'muted') : 'danger'}
            dimmed={!member.isActive}
            selected={member.id === selectedId}
            onPress={() => {
              setSelectedId(member.id);
              setFeedback(null);
            }}
          />
        ))}
        {staff?.length === 0 ? <EmptyState message="No staff yet." /> : null}
      </Panel>

      <ScrollView style={styles.editor} contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
        {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
        {selectedId === 'new' ? (
          <StaffForm
            key="new"
            onSaved={async (saved) => {
              await reload();
              setSelectedId(saved.id);
              setFeedback({ tone: 'success', message: `${saved.fullName} was added. They can sign in with their PIN now.` });
            }}
            onError={(message) => setFeedback({ tone: 'danger', message })}
          />
        ) : selected ? (
          <StaffForm
            key={selected.id}
            member={selected}
            onSaved={async (saved) => {
              await reload();
              setFeedback({ tone: 'success', message: `${saved.fullName} was updated.` });
            }}
            onError={(message) => setFeedback({ tone: 'danger', message })}
          />
        ) : (
          <Panel>
            <EmptyState message="Pick someone on the left to edit them, or add a new staff member." />
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}

/** "A day's pay: 230.77 EGP", used for penalties counted in days. */
function dailyPayHint(salary: string, workDays: string): string {
  const amount = parseMoneyInput(salary);
  const days = Number(workDays.trim());
  if (!salary.trim()) {
    return 'Optional. With a salary, penalties on the Penalties tab are also shown in EGP.';
  }

  return amount !== null && Number.isInteger(days) && days >= 1 && days <= 31
    ? `A day's pay: ${formatEgp(Math.round(amount / days))}. Penalties in days are multiplied by this.`
    : 'Enter the salary in EGP and the working days (1 to 31).';
}

function StaffForm({ member, onSaved, onError }: {
  member?: StaffSummary;
  onSaved: (saved: StaffSummary) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [fullName, setFullName] = useState(member?.fullName ?? '');
  const [role, setRole] = useState<StaffRole>(member?.role ?? 'BARISTA');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [isActive, setIsActive] = useState(member?.isActive ?? true);
  const [salary, setSalary] = useState(member?.monthlySalary != null ? String(member.monthlySalary) : '');
  const [workDays, setWorkDays] = useState(member?.workingDaysPerMonth != null ? String(member.workingDaysPerMonth) : '26');
  // "Salary counts from". Until someone edits it, it follows the salary: the current start while the amount is
  // unchanged, the 1st of this month once it changes (so a raise isn't back-dated by accident).
  const [startsOnInput, setStartsOnInput] = useState<string | null>(null);
  const firstOfMonth = `${todayBusinessDate().slice(0, 7)}-01`;
  const salaryUnchanged = member?.monthlySalary != null && parseMoneyInput(salary) === Math.round(member.monthlySalary * 100);
  const startsOn = startsOnInput ?? (salaryUnchanged && member?.salaryStartsOn ? member.salaryStartsOn : firstOfMonth);
  const [pin, setPin] = useState('');
  const [pinAgain, setPinAgain] = useState('');
  const [busy, setBusy] = useState<'save' | 'pin' | null>(null);

  const pinProblem = !PIN_PATTERN.test(pin) ? 'The PIN must be exactly 6 digits.' : pin !== pinAgain ? 'The two PINs do not match.' : null;

  const save = async () => {
    if (!fullName.trim()) {
      onError('Enter a name.');
      return;
    }

    if (!member && pinProblem) {
      onError(pinProblem);
      return;
    }

    // Salary is optional; when given, the working days turn it into a day's pay for penalties.
    const salaryAmount = salary.trim() ? parseMoneyInput(salary) : null;
    const days = Number(workDays.trim());
    if (salary.trim() && (salaryAmount === null || !Number.isInteger(days) || days < 1 || days > 31)) {
      onError('Salary is in EGP (like 6000) and working days are a whole number from 1 to 31.');
      return;
    }

    if (salary.trim() && !isBusinessDate(startsOn)) {
      onError('Salary counts from must be a date like 2026-11-01.');
      return;
    }

    setBusy('save');
    try {
      const body = {
        fullName: fullName.trim(),
        role,
        phone: phone.trim() || null,
        monthlySalary: salaryAmount === null ? null : salaryAmount / 100,
        workingDaysPerMonth: salaryAmount === null ? null : days,
        salaryStartsOn: salaryAmount === null ? null : startsOn.trim(),
      };
      const saved = member ? await updateStaff(member.id, { ...body, isActive }) : await createStaff({ ...body, pin });
      await onSaved(saved);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const changePin = async () => {
    if (!member) {
      return;
    }

    if (pinProblem) {
      onError(pinProblem);
      return;
    }

    setBusy('pin');
    try {
      await resetStaffPin(member.id, pin);
      setPin('');
      setPinAgain('');
      await onSaved(member);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const pinFields = (
    <FormRow>
      <View style={formStyles.grow}>
        <Field label={member ? 'New PIN' : 'PIN'} value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="6 digits" />
      </View>
      <View style={formStyles.grow}>
        <Field label="Repeat PIN" value={pinAgain} onChangeText={setPinAgain} keyboardType="number-pad" secureTextEntry maxLength={6} />
      </View>
    </FormRow>
  );

  return (
    <>
      <Panel title={member ? `Edit ${member.fullName}` : 'New staff member'} scroll={false}>
        <Field label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
        <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <ChipSelect label="Role" options={ROLE_OPTIONS} selected={[role]} onToggle={setRole} />
        <FormRow>
          <View style={formStyles.grow}>
            <Field label="Monthly salary (EGP)" value={salary} onChangeText={setSalary} keyboardType="decimal-pad" placeholder="e.g. 6000" />
          </View>
          <View style={formStyles.grow}>
            <Field label="Working days a month" value={workDays} onChangeText={setWorkDays} keyboardType="number-pad" />
          </View>
        </FormRow>
        {salary.trim() ? (
          <Field
            label="Salary counts from"
            value={startsOn}
            onChangeText={setStartsOnInput}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Usually the 1st of the month, so the whole month is paid. For a new hire, use their first day: that month is then paid only for the days from it."
          />
        ) : null}
        <Text style={styles.hint}>
          {dailyPayHint(salary, workDays)}
        </Text>
        <Text style={styles.hint}>
          The salary is added to Expenses → Recurring costs as &quot;Salary: name&quot; and counted as an expense every month automatically.
        </Text>
        <Text style={styles.hint}>
          Baristas take orders and toggle stock. Managers also approve refunds, cancels and cash outs, and see reports. Admins also
          edit the menu, prices, staff and promotions.
        </Text>
        {member ? (
          <ToggleRow label="Active" hint="Inactive staff disappear from the sign-in screen." value={isActive} onChange={setIsActive} />
        ) : (
          pinFields
        )}
        <View style={formStyles.actions}>
          <Button label={member ? 'Save changes' : 'Add staff member'} onPress={() => void save()} busy={busy === 'save'} large style={formStyles.grow} />
        </View>
      </Panel>

      {member ? (
        <Panel title="Reset PIN" scroll={false}>
          <Text style={styles.hint}>Use this when someone forgets their PIN or is locked out. It also unlocks the account.</Text>
          {pinFields}
          <Button label="Set new PIN" variant="secondary" onPress={() => void changePin()} busy={busy === 'pin'} />
        </Panel>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', gap: space.lg },
  list: { width: 360 },
  editor: { flex: 1 },
  editorContent: { gap: space.md, paddingBottom: space.xl },
  hint: { fontSize: font.small, color: colors.textMuted },
});
