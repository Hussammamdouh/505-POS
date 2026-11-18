import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { cancelOrder } from '@/lib/orderActions';
import type { Order } from '@/lib/types';
import { canManage, useApp } from '@/store/app';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { colors, font, radius, space } from '@/ui/theme';

interface CancelDialogProps {
  orderId: string;
  displayCode: string;
  onClose: () => void;
  onCancelled: (order: Order) => void;
}

export function CancelDialog({ orderId, displayCode, onClose, onCancelled }: CancelDialogProps) {
  const session = useApp((state) => state.session);
  const [reason, setReason] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsManagerPin = !canManage(session);

  const confirm = async () => {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      onCancelled(await cancelOrder(orderId, reason.trim(), needsManagerPin ? managerPin : null));
    } catch (cancelError) {
      setError(cancelError instanceof NetworkError ? 'Cancelling needs the internet.' : describeError(cancelError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <View style={dialogStyles.backdrop}>
        <View style={dialogStyles.dialog}>
          <Text style={dialogStyles.title}>Cancel {displayCode}?</Text>
          <Field label="Reason" value={reason} onChangeText={setReason} autoFocus />
          {needsManagerPin ? (
            <Field label="Manager PIN" value={managerPin} onChangeText={setManagerPin} keyboardType="number-pad" secureTextEntry maxLength={6} />
          ) : null}
          {error ? <Banner tone="danger" message={error} /> : null}
          <View style={dialogStyles.actions}>
            <Button label="Keep order" variant="secondary" onPress={onClose} style={dialogStyles.grow} />
            <Button label="Cancel order" variant="danger" onPress={() => void confirm()} busy={busy} style={dialogStyles.grow} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const dialogStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { width: 520, maxWidth: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.body, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: space.sm },
  grow: { flex: 1 },
});
