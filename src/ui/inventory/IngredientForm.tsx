import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RECIPE_SECTIONS, saveInventoryItem, UNIT_LABELS } from '@/lib/inventory';
import type { InventoryItem, InventoryUnit, RecipeSection } from '@/lib/types';

import { ChipSelect, formStyles, FormRow, Panel, ToggleRow } from '../admin/AdminKit';
import { Button } from '../Button';
import { Field } from '../Field';
import { colors, font } from '../theme';

const STORAGE_UNITS: InventoryUnit[] = ['G', 'ML', 'UNIT'];
const UNIT_HELP: Record<string, string> = { G: 'grams (beans, sugar, flour)', ML: 'millilitres (milk, syrups)', UNIT: 'pieces (cups, lids, croissants)' };

function parseNumber(text: string, label: string, decimals: number): number {
  const normalized = text.trim().replace(',', '.') || '0';
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(normalized)) {
    throw new Error(`${label} must be a number with at most ${decimals} decimal places.`);
  }

  return Number(normalized);
}

export function IngredientForm({ item, onSaved, onError }: {
  item: InventoryItem | null;
  onSaved: (saved: InventoryItem, message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [unit, setUnit] = useState<InventoryUnit>(item?.unitOfMeasure ?? 'G');
  const [minStock, setMinStock] = useState(item ? String(item.minStockAlert) : '');
  const [cost, setCost] = useState(item ? String(item.costPerUnit) : '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [section, setSection] = useState<RecipeSection>(item?.recipeSection ?? 'OTHER');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveInventoryItem(item?.id ?? null, {
        name: name.trim(),
        sku: sku.trim() || null,
        unitOfMeasure: unit,
        minStockAlert: parseNumber(minStock, 'Low-stock level', 3),
        costPerUnit: parseNumber(cost, 'Cost per unit', 4),
        isActive,
        recipeSection: section,
      });
      onSaved(saved, item ? `${saved.name} was updated.` : `${saved.name} was added. Record a delivery or stock count to set its stock.`);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const unitLabel = UNIT_LABELS[unit];

  return (
    <Panel title={item ? `Edit ${item.name}` : 'New ingredient'}>
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Whole milk" />
        </View>
        <View style={formStyles.grow}>
          <Field label="SKU / code (optional)" value={sku} onChangeText={setSku} autoCapitalize="characters" />
        </View>
      </FormRow>
      <ChipSelect
        label="Counted in"
        options={STORAGE_UNITS.map((value) => ({ value, label: UNIT_HELP[value] }))}
        selected={[unit]}
        onToggle={setUnit}
      />
      <ChipSelect
        label="Recipe section (where it shows when building a recipe)"
        options={RECIPE_SECTIONS.map((info) => ({ value: info.section, label: info.title }))}
        selected={[section]}
        onToggle={setSection}
      />
      <FormRow>
        <View style={formStyles.grow}>
          <Field label={`Warn when below (${unitLabel})`} value={minStock} onChangeText={setMinStock} keyboardType="decimal-pad" />
        </View>
        <View style={formStyles.grow}>
          <Field
            label={`Cost per ${unitLabel} (EGP)`}
            hint="Deliveries with a price update this automatically."
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
          />
        </View>
      </FormRow>
      {item ? <ToggleRow label="Active" hint="Inactive ingredients are hidden from stock lists." value={isActive} onChange={setIsActive} /> : null}
      {item && item.usedInRecipes > 0 ? (
        <Text style={styles.hint}>Used in {item.usedInRecipes} recipe(s). Its unit can no longer change.</Text>
      ) : null}
      <Button label={item ? 'Save ingredient' : 'Add ingredient'} onPress={() => void save()} busy={busy} large />
    </Panel>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: font.small, color: colors.textMuted },
});
