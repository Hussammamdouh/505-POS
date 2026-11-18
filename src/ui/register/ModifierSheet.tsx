import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatEgp, formatMoney, toPiastres } from '@/lib/money';
import { defaultSelection, MAX_QUANTITY_PER_LINE, toCartLine, unitPrice, validateSelection, type CartLine } from '@/lib/pricing';
import type { CatalogItem, CatalogModifierGroup } from '@/lib/types';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { colors, font, radius, space } from '@/ui/theme';

interface ModifierSheetProps {
  item: CatalogItem;
  initialSelection?: string[];
  initialQuantity?: number;
  submitVerb?: string;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}

const groupHint = (group: CatalogModifierGroup) => {
  if (group.minSelection === group.maxSelection) {
    return `Choose ${group.minSelection}`;
  }

  return group.minSelection > 0 ? `Choose ${group.minSelection}–${group.maxSelection}` : `Optional, up to ${group.maxSelection}`;
};

export function ModifierSheet({ item, initialSelection, initialQuantity = 1, submitVerb = 'Add', onClose, onAdd }: ModifierSheetProps) {
  const [selected, setSelected] = useState<string[]>(() => initialSelection ?? defaultSelection(item));
  const [quantity, setQuantity] = useState(initialQuantity);
  const [error, setError] = useState<string | null>(null);

  const toggle = (group: CatalogModifierGroup, modifierId: string) => {
    setError(null);
    setSelected((current) => {
      if (current.includes(modifierId)) {
        return current.filter((id) => id !== modifierId);
      }

      const groupIds = group.modifiers.map((modifier) => modifier.id);
      if (group.maxSelection === 1) {
        return [...current.filter((id) => !groupIds.includes(id)), modifierId];
      }

      const selectedInGroup = current.filter((id) => groupIds.includes(id)).length;
      return selectedInGroup >= group.maxSelection ? current : [...current, modifierId];
    });
  };

  const add = () => {
    const problem = validateSelection(item, selected);
    if (problem) {
      setError(problem);
      return;
    }

    onAdd(toCartLine(item, selected, quantity));
  };

  const preview = toCartLine(item, selected, quantity);

  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.price}>{formatEgp(toPiastres(item.basePrice))}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.groups}>
            {item.modifierGroups.map((group) => (
              <View key={group.id} style={styles.group}>
                <Text style={styles.groupTitle}>
                  {group.name} <Text style={styles.groupHint}>· {groupHint(group)}</Text>
                </Text>
                <View style={styles.chips}>
                  {group.modifiers.map((modifier) => {
                    const active = selected.includes(modifier.id);
                    return (
                      <Pressable
                        key={modifier.id}
                        disabled={!modifier.isInStock}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active, disabled: !modifier.isInStock }}
                        onPress={() => toggle(group, modifier.id)}
                        style={[styles.chip, active && styles.chipActive, !modifier.isInStock && styles.chipDisabled]}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{modifier.name}</Text>
                        <Text style={styles.chipPrice}>
                          {!modifier.isInStock ? 'Sold out' : modifier.extraPrice > 0 ? `+${formatMoney(toPiastres(modifier.extraPrice))}` : ' '}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {error ? <Banner tone="danger" message={error} /> : null}

          <View style={styles.footer}>
            <View style={styles.stepper}>
              <Button label="−" variant="secondary" onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={styles.stepButton} />
              <Text style={styles.quantity}>{quantity}</Text>
              <Button
                label="+"
                variant="secondary"
                onPress={() => setQuantity((value) => Math.min(MAX_QUANTITY_PER_LINE, value + 1))}
                style={styles.stepButton}
              />
            </View>
            <Button label="Cancel" variant="ghost" onPress={onClose} />
            <Button label={`${submitVerb} · ${formatEgp(unitPrice(preview) * quantity)}`} onPress={add} style={styles.add} large />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  sheet: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.lg,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text, flexShrink: 1 },
  price: { fontSize: font.large, color: colors.textMuted },
  groups: { gap: space.xl },
  group: { gap: space.sm },
  groupTitle: { fontSize: font.large, fontWeight: '700', color: colors.text },
  groupHint: { fontSize: font.small, fontWeight: '400', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minWidth: 140,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.primary },
  chipPrice: { fontSize: font.small, color: colors.textMuted },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepButton: { width: 56 },
  quantity: { width: 44, textAlign: 'center', fontSize: font.title, fontWeight: '700', color: colors.text },
  add: { flex: 1 },
});
