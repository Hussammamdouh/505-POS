import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/lib/api';
import { fetchStaffTiles } from '@/lib/auth';
import { refreshCatalog } from '@/lib/catalog';
import { printTestPage } from '@/lib/printing/printer';
import { DEFAULT_PRINTER_PORT, saveSettings, validateSettings, type DeviceSettings } from '@/lib/settings';
import { useApp } from '@/store/app';

import { Banner } from './Banner';
import { Button } from './Button';
import { Field } from './Field';
import { colors, font, space } from './theme';

type Feedback = { tone: 'success' | 'danger'; message: string } | null;

// In the browser the register is usually served by the backend itself, so its own address is the server.
const defaultServer = () => (Platform.OS === 'web' ? (globalThis.location?.origin ?? '') : '');

export function SettingsForm({ onSaved }: { onSaved?: () => void }) {
  const current = useApp((state) => state.settings);
  const [apiBaseUrl, setApiBaseUrl] = useState(current?.apiBaseUrl ?? defaultServer());
  const [deviceLetter, setDeviceLetter] = useState(current?.deviceLetter ?? 'A');
  const [printerHost, setPrinterHost] = useState(current?.printerHost ?? '');
  const [printerPort, setPrinterPort] = useState(String(current?.printerPort ?? DEFAULT_PRINTER_PORT));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<'save' | 'print' | null>(null);

  const draft = (): DeviceSettings => ({
    apiBaseUrl: apiBaseUrl.trim().replace(/\/+$/, ''),
    deviceLetter: deviceLetter.trim().toUpperCase(),
    printerHost: printerHost.trim(),
    printerPort: Number(printerPort),
  });

  const save = async () => {
    const settings = draft();
    const problem = validateSettings(settings);
    if (problem) {
      setFeedback({ tone: 'danger', message: problem });
      return;
    }

    setBusy('save');
    try {
      await saveSettings(settings);
      useApp.getState().set({ settings });
      try {
        await Promise.all([refreshCatalog(), fetchStaffTiles()]);
        setFeedback({ tone: 'success', message: 'Saved. Connected to the server and downloaded the menu.' });
      } catch (error) {
        setFeedback({ tone: 'danger', message: `Saved, but the server could not be reached: ${describeError(error)}` });
      }
      onSaved?.();
    } finally {
      setBusy(null);
    }
  };

  const testPrint = async () => {
    const settings = draft();
    const problem = validateSettings(settings);
    if (problem) {
      setFeedback({ tone: 'danger', message: problem });
      return;
    }

    setBusy('print');
    try {
      await printTestPage(settings);
      setFeedback({ tone: 'success', message: 'Test page sent to the printer.' });
    } catch (error) {
      setFeedback({ tone: 'danger', message: describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.section}>Server</Text>
      <Field
        label="Server address"
        value={apiBaseUrl}
        onChangeText={setApiBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://api.example.com"
      />
      <Field
        label="iPad letter"
        value={deviceLetter}
        onChangeText={(text) => setDeviceLetter(text.slice(-1).toUpperCase())}
        autoCapitalize="characters"
        maxLength={1}
        hint="Use a different letter on each iPad. Offline orders print as OFF-A01, OFF-B01…"
      />

      <Text style={styles.section}>Receipt printer</Text>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Field
            label="Printer IP address"
            value={printerHost}
            onChangeText={setPrinterHost}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            placeholder="192.168.1.50"
            hint="Give the printer a fixed IP (DHCP reservation) on the router."
          />
        </View>
        <View style={styles.port}>
          <Field label="Port" value={printerPort} onChangeText={setPrinterPort} keyboardType="number-pad" />
        </View>
      </View>

      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      <View style={styles.row}>
        <Button label="Save" onPress={() => void save()} busy={busy === 'save'} style={styles.grow} large />
        <Button label="Print test page" variant="secondary" onPress={() => void testPrint()} busy={busy === 'print'} style={styles.grow} large />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  section: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  grow: { flex: 1 },
  port: { width: 120 },
});
