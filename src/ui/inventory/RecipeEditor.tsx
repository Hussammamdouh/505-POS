import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RECIPE_SECTIONS, saveItemRecipe, saveModifierRecipe, UNIT_LABELS } from '@/lib/inventory';
import type { InventoryItem, Recipe, RecipeIngredient } from '@/lib/types';

import { ChipSelect, formStyles, Panel } from '../admin/AdminKit';
import { Button } from '../Button';
import { Field } from '../Field';
import { colors, font, radius, space } from '../theme';

export interface RecipeOwner {
  kind: 'item' | 'modifier';
  id: string;
  name: string;
  /** Selling price (base price for items, extra price for options), used for the margin preview. */
  price: number;
}

export interface RecipeLine {
  inventoryItemId: string;
  quantity: string;
  removes: boolean;
}

const money = (value: number) => value.toFixed(2);

export const recipeLinesFrom = (recipe: Recipe | null): RecipeLine[] =>
  (recipe?.ingredients ?? []).map((ingredient) => ({
    inventoryItemId: ingredient.inventoryItemId,
    quantity: String(Math.abs(ingredient.quantity)),
    removes: ingredient.quantity < 0,
  }));

const signedQuantity = (line: RecipeLine) => (Number(line.quantity.replace(',', '.')) || 0) * (line.removes ? -1 : 1);

export const recipeLinesCost = (lines: RecipeLine[], inventory: InventoryItem[]) => {
  const costs = new Map(inventory.map((item) => [item.id, item.costPerUnit]));
  return lines.reduce((sum, line) => sum + signedQuantity(line) * (costs.get(line.inventoryItemId) ?? 0), 0);
};

/** Validates typed amounts; throws a message naming the first ingredient without a valid amount. */
export function parseRecipeLines(lines: RecipeLine[], inventory: InventoryItem[]): RecipeIngredient[] {
  return lines.map((line) => {
    const normalized = line.quantity.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,3})?$/.test(normalized) || Number(normalized) === 0) {
      const name = inventory.find((item) => item.id === line.inventoryItemId)?.name ?? 'each ingredient';
      throw new Error(`Enter how much ${name} it uses (up to 3 decimals).`);
    }

    return { inventoryItemId: line.inventoryItemId, quantity: signedQuantity(line) };
  });
}

const NONE = '__none';

function AmountRow({ line, ingredient, onChange, onRemove, allowRemoves }: {
  line: RecipeLine;
  ingredient: InventoryItem | undefined;
  onChange: (patch: Partial<RecipeLine>) => void;
  onRemove?: () => void;
  allowRemoves?: boolean;
}) {
  const unit = ingredient ? UNIT_LABELS[ingredient.unitOfMeasure] : '';
  return (
    <View style={styles.line}>
      <Text style={styles.name} numberOfLines={1}>
        {ingredient?.name ?? 'Unknown ingredient'}
      </Text>
      {allowRemoves ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange({ removes: !line.removes })}
          style={[styles.direction, line.removes && styles.directionRemove]}>
          <Text style={[styles.directionText, line.removes && styles.directionTextRemove]}>{line.removes ? 'Removes' : 'Adds'}</Text>
        </Pressable>
      ) : null}
      <View style={styles.quantity}>
        <Field label={`Amount (${unit})`} value={line.quantity} onChangeText={(text) => onChange({ quantity: text })} keyboardType="decimal-pad" />
      </View>
      <Text style={styles.lineCost}>{money(signedQuantity(line) * (ingredient?.costPerUnit ?? 0))} EGP</Text>
      {onRemove ? <Button label="Remove" variant="ghost" onPress={onRemove} /> : null}
    </View>
  );
}

/**
 * A drink's recipe built step by step: cup, coffee, milk, syrups, sauces, add-ons, other.
 * Ingredients appear in the step set as their recipe section in Admin → Inventory.
 */
export function RecipeBuilder({ lines, onChange, inventory }: {
  lines: RecipeLine[];
  onChange: (lines: RecipeLine[]) => void;
  inventory: InventoryItem[];
}) {
  const byId = new Map(inventory.map((item) => [item.id, item]));
  const sectionOf = (id: string) => byId.get(id)?.recipeSection ?? 'OTHER';
  const newLine = (id: string, previous?: RecipeLine): RecipeLine => ({
    inventoryItemId: id,
    quantity: previous?.quantity ?? (byId.get(id)?.unitOfMeasure === 'UNIT' ? '1' : ''),
    removes: false,
  });
  const update = (id: string, patch: Partial<RecipeLine>) =>
    onChange(lines.map((line) => (line.inventoryItemId === id ? { ...line, ...patch } : line)));

  return (
    <View style={styles.block}>
      {RECIPE_SECTIONS.map((info, index) => {
        const chosen = lines.filter((line) => sectionOf(line.inventoryItemId) === info.section);
        const choices = inventory.filter(
          (item) => item.recipeSection === info.section && (item.isActive || chosen.some((line) => line.inventoryItemId === item.id)),
        );
        if (info.section === 'OTHER' && choices.length === 0 && chosen.length === 0) {
          return null;
        }

        const others = lines.filter((line) => sectionOf(line.inventoryItemId) !== info.section);
        const pick = (value: string) => {
          if (value === NONE) {
            onChange(others);
          } else if (info.mode === 'one') {
            onChange([...others, newLine(value, chosen[0])]);
          } else if (chosen.some((line) => line.inventoryItemId === value)) {
            onChange(lines.filter((line) => line.inventoryItemId !== value));
          } else {
            onChange([...lines, newLine(value)]);
          }
        };

        return (
          <View key={info.section} style={styles.step}>
            <Text style={styles.stepTitle}>
              {index + 1}. {info.title}
              <Text style={styles.hint}> · {info.help}</Text>
            </Text>
            {choices.length > 0 ? (
              <ChipSelect
                options={[{ value: NONE, label: info.noneLabel }, ...choices.map((item) => ({ value: item.id, label: item.name }))]}
                selected={chosen.length === 0 ? [NONE] : chosen.map((line) => line.inventoryItemId)}
                onToggle={pick}
              />
            ) : (
              <Text style={styles.hint}>
                No {info.title.toLowerCase()} ingredients yet. Add them in Admin → Inventory and set their recipe section to {info.title}.
              </Text>
            )}
            {chosen.map((line) => (
              <AmountRow
                key={line.inventoryItemId}
                line={line}
                ingredient={byId.get(line.inventoryItemId)}
                onChange={(patch) => update(line.inventoryItemId, patch)}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** The ingredient rows plus an "add ingredient" picker. Amounts are in each ingredient's unit (g, ml or units). */
export function RecipeLines({ lines, onChange, inventory, allowRemoves }: {
  lines: RecipeLine[];
  onChange: (lines: RecipeLine[]) => void;
  inventory: InventoryItem[];
  allowRemoves: boolean;
}) {
  const byId = new Map(inventory.map((item) => [item.id, item]));
  const available = inventory.filter((item) => item.isActive && !lines.some((line) => line.inventoryItemId === item.id));
  const update = (index: number, patch: Partial<RecipeLine>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));

  return (
    <View style={styles.block}>
      {lines.map((line, index) => (
        <AmountRow
          key={line.inventoryItemId}
          line={line}
          ingredient={byId.get(line.inventoryItemId)}
          allowRemoves={allowRemoves}
          onChange={(patch) => update(index, patch)}
          onRemove={() => onChange(lines.filter((_, position) => position !== index))}
        />
      ))}

      <ChipSelect
        label={lines.length === 0 ? 'Add an ingredient' : 'Add another ingredient'}
        options={available.map((item) => ({ value: item.id, label: `${item.name} (${UNIT_LABELS[item.unitOfMeasure]})` }))}
        selected={[]}
        onToggle={(id) => onChange([...lines, { inventoryItemId: id, quantity: '', removes: false }])}
      />
      {inventory.length === 0 ? <Text style={styles.hint}>Add ingredients first in Admin → Inventory.</Text> : null}
    </View>
  );
}

export function RecipeEditor({ owner, recipe, inventory, onSaved, onError, onCancel }: {
  owner: RecipeOwner;
  recipe: Recipe | null;
  inventory: InventoryItem[];
  onSaved: (message: string) => void;
  onError: (error: unknown) => void;
  onCancel?: () => void;
}) {
  const [lines, setLines] = useState<RecipeLine[]>(recipeLinesFrom(recipe));
  const [swapId, setSwapId] = useState<string | null>(recipe?.swapInventoryItemId ?? null);
  const [busy, setBusy] = useState(false);

  const cost = recipeLinesCost(lines, inventory);
  const margin = owner.kind === 'item' && owner.price > 0 ? Math.round(((owner.price - cost) / owner.price) * 100) : null;
  const swapChoices = inventory.filter((item) => item.recipeSection !== 'OTHER' && (item.isActive || item.id === swapId));
  const swapIn = inventory.find((item) => item.id === swapId) ?? null;
  const swapSection = swapIn ? RECIPE_SECTIONS.find((info) => info.section === swapIn.recipeSection)?.title.toLowerCase() : null;

  const save = async () => {
    setBusy(true);
    try {
      const ingredients = parseRecipeLines(lines, inventory);
      if (owner.kind === 'item') {
        await saveItemRecipe(owner.id, ingredients);
      } else {
        await saveModifierRecipe(owner.id, ingredients, swapId);
      }

      onSaved(
        ingredients.length === 0 && !swapId
          ? `The recipe for ${owner.name} was removed. Its cost is manual again (set it in Admin → Menu).`
          : swapIn && ingredients.length === 0
            ? `${owner.name} saved: it uses ${swapIn.name} instead of the drink's ${swapSection}, at the drink's amount.`
            : `Recipe for ${owner.name} saved. Its ingredient cost is now ${money(Math.max(0, cost))} EGP.`,
      );
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={`Recipe: ${owner.name}`}>
      <Text style={styles.hint}>
        {owner.kind === 'item'
          ? 'What one serving uses. It is taken off stock each time this item is sold, and sets the item cost for profit reports.'
          : 'What choosing this option changes in any drink it is attached to.'}
      </Text>

      {owner.kind === 'item' ? (
        <RecipeBuilder lines={lines} onChange={setLines} inventory={inventory} />
      ) : (
        <>
          <View style={styles.step}>
            <Text style={styles.stepTitle}>
              1. Swap an ingredient
              <Text style={styles.hint}> · e.g. Oat milk, Coconut milk, Caramel sauce</Text>
            </Text>
            <Text style={styles.hint}>
              The drink keeps its own amount: if a frappe uses 80 ml milk, choosing Oat milk uses 80 ml oat milk instead; a latte with 200 ml
              milk uses 200 ml oat milk.
            </Text>
            <ChipSelect
              options={[{ value: NONE, label: 'No swap' }, ...swapChoices.map((item) => ({ value: item.id, label: item.name }))]}
              selected={[swapId ?? NONE]}
              onToggle={(value) => setSwapId(value === NONE ? null : value)}
            />
            {swapIn ? (
              <Text style={styles.swapNote}>
                Uses {swapIn.name} instead of the drink&apos;s {swapSection}, same amount.
              </Text>
            ) : null}
          </View>
          <Text style={styles.stepTitle}>
            2. Extra amounts
            <Text style={styles.hint}> · e.g. Large: adds 100 ml milk; Extra shot: adds 9 g coffee</Text>
          </Text>
          <RecipeLines lines={lines} onChange={setLines} inventory={inventory} allowRemoves />
        </>
      )}

      <View style={styles.summary}>
        <Text style={styles.summaryText}>Ingredient cost: {money(cost)} EGP</Text>
        {margin !== null ? (
          <Text style={styles.summaryText}>
            Price {money(owner.price)} EGP · margin {margin}%
          </Text>
        ) : null}
      </View>
      <View style={formStyles.actions}>
        <Button label="Save recipe" onPress={() => void save()} busy={busy} large style={formStyles.grow} />
        {onCancel ? <Button label="Cancel" variant="secondary" onPress={onCancel} large /> : null}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  swapNote: { fontSize: font.body, fontWeight: '600', color: colors.success },
  step: { gap: space.sm, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepTitle: { fontSize: font.large, fontWeight: '700', color: colors.text },
  hint: { fontSize: font.small, color: colors.textMuted },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  name: { flex: 1, fontSize: font.body, fontWeight: '600', color: colors.text, paddingBottom: space.md },
  direction: {
    minHeight: 52,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.successSoft,
  },
  directionRemove: { backgroundColor: colors.dangerSoft },
  directionText: { fontSize: font.body, fontWeight: '600', color: colors.success },
  directionTextRemove: { color: colors.danger },
  quantity: { width: 150 },
  lineCost: { width: 90, textAlign: 'right', fontSize: font.body, color: colors.textMuted, paddingBottom: space.md, fontVariant: ['tabular-nums'] },
  summary: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  summaryText: { fontSize: font.large, fontWeight: '600', color: colors.text },
});
