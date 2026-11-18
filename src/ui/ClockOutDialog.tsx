import { useState } from 'react';
import { Modal, Text, View } from 'react-native';

import { ApiError, describeError, NetworkError } from '@/lib/api';
import { clockOut, formatDuration } from '@/lib/attendance';
import { formatClock } from '@/lib/businessDay';
import { clockOffline, localOnDuty } from '@/lib/offlineClock';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { dialogStyles } from '@/ui/orders/CancelDialog';
import { PIN_LENGTH, PinPad } from '@/ui/PinPad';

/** Clock out and leave in one go: the PIN confirms it is really you, then the iPad locks. */
export function ClockOutDialog({ staffId, fullName, onClose, onDone }: {
  staffId: string;
  fullName: string;
  onClose: () => void;
  /** Called once clocked out; the caller locks the iPad. */
  onDone: () => void;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (enteredPin: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await clockOut(staffId, enteredPin);
      setDone(`${result.fullName} clocked out. Worked ${formatDuration(result.minutesWorked)}.`);
    } catch (clockError) {
      if (clockError instanceof NetworkError) {
        await submitOffline(enteredPin);
        return;
      }

      setError(clockError instanceof ApiError && clockError.status === 401 ? 'Wrong PIN. Try again.' : describeError(clockError));
    } finally {
      setPin('');
      setBusy(false);
    }
  };

  const submitOffline = async (enteredPin: string) => {
    // Offline clocking toggles, so make sure this really is a clock-out.
    if (!(await localOnDuty()).some((entry) => entry.staffId === staffId)) {
      setError(`${fullName} is not clocked in on this iPad.`);
      return;
    }

    const event = await clockOffline(staffId, enteredPin);
    if (!event) {
      setError('Wrong PIN. Try again.');
      return;
    }

    setDone(`${event.fullName} clocked out at ${formatClock(event.occurredAt)} (offline). It will be sent when the internet is back.`);
  };

  const changePin = (value: string) => {
    setPin(value);
    if (value.length === PIN_LENGTH && !busy) {
      void submit(value);
    }
  };

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={done ? onDone : onClose}>
      <View style={dialogStyles.backdrop}>
        <View style={[dialogStyles.dialog, { alignItems: 'center' }]}>
          <Text style={dialogStyles.title}>{done ? 'See you next time' : `Clock out ${fullName}?`}</Text>
          {done ? (
            <>
              <Banner tone="success" message={done} />
              <Button label="Lock the iPad" onPress={onDone} large style={{ alignSelf: 'stretch' }} />
            </>
          ) : (
            <>
              <Text style={dialogStyles.meta}>Enter your PIN to clock out. The iPad locks afterwards.</Text>
              <PinPad value={pin} onChange={changePin} disabled={busy} />
              {error ? <Banner tone="danger" message={error} /> : null}
              <Button label="Cancel" variant="secondary" onPress={onClose} style={{ alignSelf: 'stretch' }} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
