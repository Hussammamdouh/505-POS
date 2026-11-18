import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  deleteCategory,
  saveCategory,
  saveMenuItem,
  saveModifier,
  saveModifierGroup,
} from '@/lib/admin';
import { describeError, NetworkError } from '@/lib/api';
import { saveItemRecipe } from '@/lib/inventory';
import { formatMoney, parseMoneyInput, toEgp, toPiastres } from '@/lib/money';
import type { AdminCatalog, AdminCategory, AdminMenuItem, AdminModifier, AdminModifierGroup, InventoryItem, Recipe } from '@/lib/types';

import { Button } from '../Button';
import { Field } from '../Field';
import { parseRecipeLines, RecipeBuilder, recipeLinesCost, recipeLinesFrom, type RecipeLine } from '../inventory/RecipeEditor';
import { colors, font, radius, space } from '../theme';
import { ChipSelect, formStyles, FormRow, ListRow, Panel, ToggleRow } from './AdminKit';

export const errorMessage = (error: unknown) => (error instanceof NetworkError ? 'This needs the internet.' : describeError(error));

interface FormCallbacks<T> {
  onSaved: (saved: T, message: string) => void;
  onError: (message: string) => void;
}

const moneyText = (amount: number | undefined) => (amount === undefined ? '' : formatMoney(toPiastres(amount)));

function parseMoney(text: string, label: string, allowEmpty = false): number {
  if (allowEmpty && text.trim() === '') {
    return 0;
  }

  const piastres = parseMoneyInput(text);
  if (piastres === null) {
    throw new Error(`${label} must be a number like 45 or 45.50.`);
  }

  return toEgp(piastres);
}

function parseWhole(text: string, label: string): number {
  const value = text.trim() === '' ? 0 : Number(text.trim());
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number (0 or more).`);
  }

  return value;
}

export function CategoryForm({ category, onSaved, onDeleted, onError }: FormCallbacks<AdminCategory> & {
  category: AdminCategory | null;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const save = async () => {
    setBusy('save');
    try {
      const saved = await saveCategory(category?.id ?? null, { name: name.trim(), sortOrder: parseWhole(sortOrder, 'Position'), isActive });
      onSaved(saved, category ? `"${saved.name}" was updated.` : `"${saved.name}" was added.`);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!category) {
      return;
    }

    setBusy('delete');
    try {
      await deleteCategory(category.id);
      onDeleted();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title={category ? `Category: ${category.name}` : 'New category'}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Hot drinks" />
      <Field label="Position" hint="Lower numbers show first on the register." value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" />
      <ToggleRow label="Show on the menu" hint="Hidden categories hide all their items." value={isActive} onChange={setIsActive} />
      <View style={formStyles.actions}>
        <Button label={category ? 'Save category' : 'Add category'} onPress={() => void save()} busy={busy === 'save'} large style={formStyles.grow} />
        {category ? <Button label="Delete" variant="danger" onPress={() => void remove()} busy={busy === 'delete'} large /> : null}
      </View>
      {category ? <Text style={styles.hint}>Only empty categories can be deleted. To stop selling one, turn off &quot;Show on the menu&quot;.</Text> : null}
    </Panel>
  );
}

export function ItemForm({ item, catalog, defaultCategoryId, inventory, recipe, onSaved, onError }: FormCallbacks<AdminMenuItem> & {
  item: AdminMenuItem | null;
  catalog: AdminCatalog;
  defaultCategoryId: string | null;
  inventory: InventoryItem[];
  recipe: Recipe | null;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId ?? catalog.categories[0]?.id ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(moneyText(item?.basePrice));
  const [cost, setCost] = useState(moneyText(item?.estimatedMaterialCost));
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [pos, setPos] = useState(item?.isAvailablePos ?? true);
  const [web, setWeb] = useState(item?.isAvailableWeb ?? true);
  const [talabat, setTalabat] = useState(item?.isAvailableTalabat ?? false);
  const [inStock, setInStock] = useState(item?.isInStock ?? true);
  const [groupIds, setGroupIds] = useState<string[]>(item?.modifierGroupIds ?? []);
  const [lines, setLines] = useState<RecipeLine[]>(() => recipeLinesFrom(recipe));
  const [busy, setBusy] = useState(false);

  const usesRecipe = lines.length > 0;
  const recipeCost = Math.max(0, recipeLinesCost(lines, inventory));
  const pricePiastres = parseMoneyInput(price);
  const costPiastres = usesRecipe ? Math.round(recipeCost * 100) : cost.trim() === '' ? 0 : parseMoneyInput(cost);
  const margin =
    pricePiastres && costPiastres !== null && pricePiastres > 0
      ? Math.round(((pricePiastres - costPiastres) / pricePiastres) * 100)
      : null;

  const save = async () => {
    setBusy(true);
    try {
      if (!categoryId) {
        throw new Error('Add a category first.');
      }

      const ingredients = parseRecipeLines(lines, inventory);
      const recipeChanged = JSON.stringify(ingredients) !== JSON.stringify(recipe?.ingredients ?? []);
      const saved = await saveMenuItem(item?.id ?? null, {
        categoryId,
        name: name.trim(),
        description: description.trim() || null,
        basePrice: parseMoney(price, 'Price'),
        estimatedMaterialCost: usesRecipe ? Math.round(recipeCost * 100) / 100 : parseMoney(cost, 'Ingredient cost', true),
        imageUrl: imageUrl.trim() || null,
        isAvailablePos: pos,
        isAvailableWeb: web,
        isAvailableTalabat: talabat,
        isInStock: inStock,
        sortOrder: parseWhole(sortOrder, 'Position'),
        modifierGroupIds: groupIds,
      });
      const verb = item ? 'updated' : 'added';
      if (recipeChanged) {
        try {
          await saveItemRecipe(saved.id, ingredients);
        } catch (error) {
          onSaved(saved, `"${saved.name}" was ${verb}, but its recipe was not saved: ${errorMessage(error)}`);
          return;
        }
      }

      onSaved(saved, `"${saved.name}" was ${verb}${recipeChanged ? (usesRecipe ? ' with its recipe' : ' and its recipe removed') : ''}.`);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleGroup = (id: string) =>
    setGroupIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));

  return (
    <Panel title={item ? `Item: ${item.name}` : 'New menu item'}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Iced latte" />
      <ChipSelect
        label="Category"
        options={catalog.categories.map((category) => ({ value: category.id, label: category.name }))}
        selected={[categoryId]}
        onToggle={setCategoryId}
      />
      <Field label="Description (optional, shown on the website)" value={description} onChangeText={setDescription} multiline />
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="Price (EGP)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="95.00" />
        </View>
        <View style={formStyles.grow}>
          <Field
            label={usesRecipe ? 'Ingredient cost (from recipe)' : 'Ingredient cost (EGP)'}
            hint={
              usesRecipe
                ? `Worked out from the recipe below${margin === null ? '' : ` · margin ${margin}%`}.`
                : margin === null
                  ? 'Used for profit reports.'
                  : `Margin ${margin}%`
            }
            value={usesRecipe ? recipeCost.toFixed(2) : cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
            placeholder="30.00"
            editable={!usesRecipe}
          />
        </View>
        <View style={formStyles.grow}>
          <Field label="Position" value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" />
        </View>
      </FormRow>
      <Text style={styles.section}>Recipe (one serving)</Text>
      <Text style={styles.hint}>
        Go through each step: pick the cup, then coffee and how many grams, then milk and how much, then syrups, sauces and add-ons. Each sale
        takes it off stock. Set what the paid options (size, extra shot…)
        change in Admin → Recipes.
      </Text>
      <RecipeBuilder lines={lines} onChange={setLines} inventory={inventory} />
      <ChipSelect
        label="Option groups (e.g. size, milk)"
        options={catalog.modifierGroups.map((group) => ({ value: group.id, label: group.isActive ? group.name : `${group.name} (off)` }))}
        selected={groupIds}
        onToggle={toggleGroup}
      />
      <Text style={styles.section}>Where it is sold</Text>
      <ToggleRow label="Register (POS)" value={pos} onChange={setPos} />
      <ToggleRow label="Website" value={web} onChange={setWeb} />
      <ToggleRow label="Talabat" value={talabat} onChange={setTalabat} />
      <ToggleRow label="In stock" hint="Baristas can also change this from the Stock tab." value={inStock} onChange={setInStock} />
      <Field label="Image URL (optional, for the website)" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" autoCorrect={false} />
      <View style={formStyles.actions}>
        <Button label={item ? 'Save item' : 'Add item'} onPress={() => void save()} busy={busy} large style={formStyles.grow} />
      </View>
      {item ? <Text style={styles.hint}>Items cannot be deleted because past orders refer to them. Turn off every channel to stop selling one.</Text> : null}
    </Panel>
  );
}

export function GroupEditor({ group, onSaved, onError }: FormCallbacks<AdminModifierGroup> & { group: AdminModifierGroup | null }) {
  const [name, setName] = useState(group?.name ?? '');
  const [min, setMin] = useState(String(group?.minSelection ?? 0));
  const [max, setMax] = useState(String(group?.maxSelection ?? 1));
  const [isActive, setIsActive] = useState(group?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveModifierGroup(group?.id ?? null, {
        name: name.trim(),
        minSelection: parseWhole(min, 'Minimum'),
        maxSelection: parseWhole(max, 'Maximum'),
        isActive,
      });
      onSaved(saved, group ? `"${saved.name}" was updated.` : `"${saved.name}" was added. Now add its options.`);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const modifiers = [...(group?.modifiers ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const editingModifier = editing && editing !== 'new' ? modifiers.find((modifier) => modifier.id === editing) ?? null : null;

  return (
    <View style={styles.groupEditor}>
      <Panel title={group ? `Option group: ${group.name}` : 'New option group'} style={styles.groupForm}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Milk" />
        <FormRow>
          <View style={formStyles.grow}>
            <Field label="Minimum choices" hint="1 or more makes it required." value={min} onChangeText={setMin} keyboardType="number-pad" />
          </View>
          <View style={formStyles.grow}>
            <Field label="Maximum choices" value={max} onChangeText={setMax} keyboardType="number-pad" />
          </View>
        </FormRow>
        <ToggleRow label="Active" hint="Inactive groups are hidden on every item." value={isActive} onChange={setIsActive} />
        <Button label={group ? 'Save group' : 'Add group'} onPress={() => void save()} busy={busy} large />
      </Panel>

      {group ? (
        <Panel
          title="Options"
          style={styles.groupForm}
          action={<Button label="+ Add option" variant="secondary" onPress={() => setEditing('new')} />}>
          {modifiers.map((modifier) => (
            <ListRow
              key={modifier.id}
              title={modifier.name}
              subtitle={`+${formatMoney(toPiastres(modifier.extraPrice))} EGP · cost ${formatMoney(toPiastres(modifier.estimatedMaterialCost))}${modifier.isDefault ? ' · default' : ''}`}
              badge={modifier.isInStock ? null : 'Sold out'}
              badgeTone="danger"
              selected={modifier.id === editing}
              onPress={() => setEditing(modifier.id)}
            />
          ))}
          {modifiers.length === 0 && editing !== 'new' ? <Text style={styles.hint}>No options yet.</Text> : null}
          {editing ? (
            <ModifierForm
              key={editing}
              groupId={group.id}
              modifier={editingModifier}
              onSaved={(saved, message) => {
                setEditing(null);
                onSaved(group, message);
              }}
              onCancel={() => setEditing(null)}
              onError={onError}
            />
          ) : null}
        </Panel>
      ) : null}
    </View>
  );
}

function ModifierForm({ groupId, modifier, onSaved, onCancel, onError }: FormCallbacks<AdminModifier> & {
  groupId: string;
  modifier: AdminModifier | null;
  onCancel: () => void;
}) {
  const [name, setName] = useState(modifier?.name ?? '');
  const [price, setPrice] = useState(moneyText(modifier?.extraPrice ?? 0));
  const [cost, setCost] = useState(moneyText(modifier?.estimatedMaterialCost ?? 0));
  const [sortOrder, setSortOrder] = useState(String(modifier?.sortOrder ?? 0));
  const [isDefault, setIsDefault] = useState(modifier?.isDefault ?? false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveModifier(groupId, modifier?.id ?? null, {
        name: name.trim(),
        extraPrice: parseMoney(price, 'Extra price', true),
        estimatedMaterialCost: parseMoney(cost, 'Ingredient cost', true),
        isDefault,
        sortOrder: parseWhole(sortOrder, 'Position'),
      });
      onSaved(saved, modifier ? `"${saved.name}" was updated.` : `"${saved.name}" was added.`);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.subForm}>
      <Text style={styles.section}>{modifier ? `Edit option: ${modifier.name}` : 'New option'}</Text>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Oat milk" />
      <FormRow>
        <View style={formStyles.grow}>
          <Field label="Extra price (EGP)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        </View>
        <View style={formStyles.grow}>
          <Field
            label={modifier?.hasRecipe ? 'Ingredient cost (from recipe)' : 'Ingredient cost (EGP)'}
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
            editable={!modifier?.hasRecipe}
          />
        </View>
        <View style={formStyles.grow}>
          <Field label="Position" value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" />
        </View>
      </FormRow>
      <ToggleRow label="Selected by default" value={isDefault} onChange={setIsDefault} />
      <View style={formStyles.actions}>
        <Button label={modifier ? 'Save option' : 'Add option'} onPress={() => void save()} busy={busy} style={formStyles.grow} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: font.small, color: colors.textMuted },
  section: { fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: space.sm },
  groupEditor: { flex: 1, flexDirection: 'row', gap: space.lg },
  groupForm: { flex: 1 },
  subForm: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.background },
});
