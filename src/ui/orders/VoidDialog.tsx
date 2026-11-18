import { useState } from 'react';
import { Modal, Text, View } from 'react-native';

import { describeError, NetworkError } from '@/lib/api';
import { formatEgp, toPiastres } from '@/lib/money';
import { voidOrder } from '@/lib/orderActions';
import type { Order } from '@/lib/types';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';

import { dialogStyles } from './CancelDialog';

export function VoidDialog({ order, onClose, onVoided }: { order: Order; onClose: () => void; onVoided: (order: Order) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refundable = toPiastres(order.amountPaid) - toPiastres(order.amountRefunded);

  const confirm = async () => {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      onVoided(await voidOrder(order.id, reason.trim()));
    } catch (voidError) {
      setError(voidError instanceof NetworkError ? 'Voiding needs the internet.' : describeError(voidError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <View style={dialogStyles.backdrop}>
        <View style={dialogStyles.dialog}>
          <Text style={dialogStyles.title}>Void {order.displayCode}?</Text>
          <Text style={dialogStyles.meta}>
            {refundable > 0
              ? `${formatEgp(refundable)} is refunded by the methods it was paid with. `
              : ''}
            The order is removed from sales reports and its ingredients go back into stock. This cannot be undone.
          </Text>
          <Field label="Reason" value={reason} onChangeText={setReason} autoFocus />
          {error ? <Banner tone="danger" message={error} /> : null}
          <View style={dialogStyles.actions}>
            <Button label="Keep order" variant="secondary" onPress={onClose} style={dialogStyles.grow} />
            <Button label="Void order" variant="danger" onPress={() => void confirm()} busy={busy} style={dialogStyles.grow} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
