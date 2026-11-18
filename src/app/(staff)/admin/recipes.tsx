import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { loadAdminCatalog } from '@/lib/admin';
import { formatQuantity, loadInventory, loadRecipeBook, RECIPE_SECTION_LABELS, RECIPE_SECTIONS } from '@/lib/inventory';
import type { AdminCatalog, AdminMenuItem, AdminModifier, InventoryItem, Recipe, RecipeBook } from '@/lib/types';
import { EmptyState, ListRow, Panel } from '@/ui/admin/AdminKit';
import { errorMessage } from '@/ui/admin/MenuForms';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { RecipeEditor, type RecipeOwner } from '@/ui/inventory/RecipeEditor';
import { colors, font, radius, space } from '@/ui/theme';

type Feedback = { tone: 'success' | 'danger'; message: string } | null;

const money = (value: number) => value.toFixed(2);

export default function RecipesAdminScreen() {
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [book, setBook] = useState<RecipeBook | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecipeOwner | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const fail = useCallback((error: unknown) => setFeedback({ tone: 'danger', message: errorMessage(error) }), []);

  const load = useCallback(
    () =>
      Promise.all([loadAdminCatalog(), loadRecipeBook(), loadInventory()]).then(([loadedCatalog, loadedBook, items]) => {
        setCatalog(loadedCatalog);
        setBook(loadedBook);
        setInventory(items);
      }),
    [],
  );

  useEffect(() => {
    load().catch(fail);
  }, [load, fail]);

  if (!catalog || !book) {
    return feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : <EmptyState message="Loading recipes…" />;
  }

  const itemRecipe = (id: string) => book.menuItems.find((recipe) => recipe.ownerId === id) ?? null;
  const modifierRecipe = (id: string) => book.modifiers.find((recipe) => recipe.ownerId === id) ?? null;
  const selected = catalog.items.find((item) => item.id === selectedId) ?? null;
  const missing = catalog.items.filter((item) => !itemRecipe(item.id)).length;
  const categories = [...catalog.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const startEdit = (owner: RecipeOwner) => {
    setEditing(owner);
    setFeedback(null);
  };

  return (
    <View style={styles.screen}>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
      <View style={styles.columns}>
        <Panel title={missing ? `Drinks & items · ${missing} without a recipe` : 'Drinks & items'} style={styles.list}>
          {categories.map((category) => {
            const items = catalog.items
              .filter((item) => item.categoryId === category.id)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
            if (items.length === 0) {
              return null;
            }

            return (
              <View key={category.id}>
                <Text style={styles.group}>{category.name}</Text>
                {items.map((item) => {
                  const recipe = itemRecipe(item.id);
                  return (
                    <ListRow
                      key={item.id}
                      title={item.name}
                      subtitle={recipe ? `${recipe.ingredients.length} ingredients · cost ${money(recipe.cost)} EGP` : 'No recipe yet'}
                      badge={recipe ? null : 'No recipe'}
                      badgeTone="muted"
                      selected={item.id === selectedId}
                      onPress={() => {
                        setSelectedId(item.id);
                        setEditing(null);
                        setFeedback(null);
                      }}
                    />
                  );
                })}
              </View>
            );
          })}
          {catalog.items.length === 0 ? <EmptyState message="Add menu items first (Admin → Menu)." /> : null}
        </Panel>

        <View style={styles.detail}>
          {editing ? (
            <RecipeEditor
              key={`${editing.kind}-${editing.id}`}
              owner={editing}
              recipe={editing.kind === 'item' ? itemRecipe(editing.id) : modifierRecipe(editing.id)}
              inventory={inventory}
              onCancel={() => setEditing(null)}
              onSaved={(message) => {
                setEditing(null);
                setFeedback({ tone: 'success', message });
                load().catch(fail);
              }}
              onError={fail}
            />
          ) : selected ? (
            <RecipeCard
              item={selected}
              catalog={catalog}
              recipe={itemRecipe(selected.id)}
              modifierRecipe={modifierRecipe}
              inventory={inventory}
              onEdit={startEdit}
            />
          ) : (
            <Panel scroll={false}>
              <EmptyState
                message={
                  inventory.length === 0
                    ? 'Add ingredients first (Admin → Inventory), then build recipes here.'
                    : 'Pick a drink to see its recipe and how much each add-on uses.'
                }
              />
            </Panel>
          )}
        </View>
      </View>
    </View>
  );
}

function RecipeCard({ item, catalog, recipe, modifierRecipe, inventory, onEdit }: {
  item: AdminMenuItem;
  catalog: AdminCatalog;
  recipe: Recipe | null;
  modifierRecipe: (id: string) => Recipe | null;
  inventory: InventoryItem[];
  onEdit: (owner: RecipeOwner) => void;
}) {
  const byId = new Map(inventory.map((ingredient) => [ingredient.id, ingredient]));
  const nameOf = (id: string) => byId.get(id)?.name ?? 'Unknown ingredient';
  const amount = (id: string, quantity: number) => {
    const ingredient = byId.get(id);
    return ingredient ? formatQuantity(quantity, ingredient.unitOfMeasure) : String(quantity);
  };
  const sectionIndex = (id: string) => RECIPE_SECTIONS.findIndex((info) => info.section === (byId.get(id)?.recipeSection ?? 'OTHER'));
  const baseQuantity = (id: string) => recipe?.ingredients.find((line) => line.inventoryItemId === id)?.quantity ?? 0;
  const groups = catalog.modifierGroups
    .filter((group) => item.modifierGroupIds.includes(group.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const margin = recipe && item.basePrice > 0 ? Math.round(((item.basePrice - recipe.cost) / item.basePrice) * 100) : null;

  // A swap option uses its ingredient at this drink's amount of the same section (e.g. its 80 ml of milk).
  const swapRow = (swapId: string) => {
    const section = byId.get(swapId)?.recipeSection;
    const replaced = (recipe?.ingredients ?? []).filter((line) => section && section !== 'OTHER' && byId.get(line.inventoryItemId)?.recipeSection === section);
    const quantity = replaced.reduce((sum, line) => sum + line.quantity, 0);
    const swapCost = byId.get(swapId)?.costPerUnit ?? 0;
    const costChange = replaced.reduce((sum, line) => sum + line.quantity * (swapCost - (byId.get(line.inventoryItemId)?.costPerUnit ?? 0)), 0);
    return (
      <View style={styles.row}>
        <Text style={[styles.change, styles.adds]}>{replaced.length > 0 ? amount(swapId, quantity) : '—'}</Text>
        <Text style={styles.ingredient}>
          {nameOf(swapId)}
          <Text style={styles.muted}>
            {replaced.length > 0
              ? ` instead of ${replaced.map((line) => nameOf(line.inventoryItemId)).join(' + ')}`
              : ` · this drink has no ${RECIPE_SECTION_LABELS[section ?? 'OTHER'].toLowerCase()} in its recipe, so nothing is swapped`}
          </Text>
        </Text>
        {replaced.length > 0 ? (
          <Text style={styles.total}>
            {Math.abs(costChange) < 0.005 ? 'same cost' : `${costChange > 0 ? '+' : '−'}${money(Math.abs(costChange))} EGP cost`}
          </Text>
        ) : null}
      </View>
    );
  };

  const optionRow = (groupName: string, modifier: AdminModifier) => {
    const changes = modifierRecipe(modifier.id);
    return (
      <View key={modifier.id} style={styles.option}>
        <View style={styles.optionHeader}>
          <Text style={styles.optionName}>
            {modifier.name}
            {modifier.extraPrice > 0 ? <Text style={styles.muted}> · +{money(modifier.extraPrice)} EGP</Text> : null}
            {modifier.isDefault ? <Text style={styles.muted}> · default</Text> : null}
          </Text>
          <Button
            label={changes ? 'Edit' : 'Set amounts'}
            variant="ghost"
            onPress={() => onEdit({ kind: 'modifier', id: modifier.id, name: `${groupName}: ${modifier.name}`, price: modifier.extraPrice })}
          />
        </View>
        {changes?.swapInventoryItemId ? swapRow(changes.swapInventoryItemId) : null}
        {changes && (changes.ingredients.length > 0 || changes.swapInventoryItemId) ? (
          changes.ingredients.map((line) => {
            const base = baseQuantity(line.inventoryItemId);
            const total = base + line.quantity;
            return (
              <View key={line.inventoryItemId} style={styles.row}>
                <Text style={[styles.change, line.quantity < 0 ? styles.removes : styles.adds]}>
                  {line.quantity < 0 ? '−' : '+'}
                  {amount(line.inventoryItemId, Math.abs(line.quantity))}
                </Text>
                <Text style={styles.ingredient}>{nameOf(line.inventoryItemId)}</Text>
                <Text style={styles.total}>
                  {base !== 0 ? `${total <= 0 ? 'none' : amount(line.inventoryItemId, total)} in the drink` : ''}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.muted}>Uses no extra ingredients.</Text>
        )}
      </View>
    );
  };

  return (
    <Panel
      title={item.name}
      action={<Button label={recipe ? 'Edit recipe' : 'Add recipe'} onPress={() => onEdit({ kind: 'item', id: item.id, name: item.name, price: item.basePrice })} />}>
      <Text style={styles.muted}>
        Price {money(item.basePrice)} EGP
        {recipe ? ` · ingredient cost ${money(recipe.cost)} EGP` : ''}
        {margin !== null ? ` · margin ${margin}%` : ''}
      </Text>

      <Text style={styles.section}>One serving</Text>
      {recipe ? (
        [...recipe.ingredients]
          .sort((a, b) => sectionIndex(a.inventoryItemId) - sectionIndex(b.inventoryItemId))
          .map((line) => (
          <View key={line.inventoryItemId} style={styles.row}>
            <Text style={styles.sectionLabel}>{RECIPE_SECTION_LABELS[byId.get(line.inventoryItemId)?.recipeSection ?? 'OTHER']}</Text>
            <Text style={styles.quantity}>{amount(line.inventoryItemId, line.quantity)}</Text>
            <Text style={styles.ingredient}>{nameOf(line.inventoryItemId)}</Text>
            <Text style={styles.total}>{money(line.quantity * (byId.get(line.inventoryItemId)?.costPerUnit ?? 0))} EGP</Text>
          </View>
        ))
      ) : (
        <Text style={styles.muted}>No recipe yet. Add one so each sale takes the ingredients off stock.</Text>
      )}

      {groups.map((group) => (
        <View key={group.id} style={styles.groupBlock}>
          <Text style={styles.section}>
            {group.name}
            {group.isActive ? '' : ' (off)'}
          </Text>
          {[...group.modifiers]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            .map((modifier) => optionRow(group.name, modifier))}
          {group.modifiers.length === 0 ? <Text style={styles.muted}>No options in this group.</Text> : null}
        </View>
      ))}
      {groups.length === 0 ? <Text style={styles.muted}>This item has no add-ons. Attach option groups in Admin → Menu.</Text> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  list: { width: 380 },
  detail: { flex: 1 },
  group: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginTop: space.md, marginLeft: space.sm },
  section: { fontSize: font.large, fontWeight: '700', color: colors.text, marginTop: space.md },
  groupBlock: { gap: space.sm },
  muted: { fontSize: font.small, color: colors.textMuted, fontWeight: '400' },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionLabel: { width: 80, fontSize: font.small, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  quantity: { width: 110, fontSize: font.body, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  ingredient: { flex: 1, fontSize: font.body, color: colors.text },
  total: { fontSize: font.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  option: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.background },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  optionName: { flex: 1, fontSize: font.body, fontWeight: '600', color: colors.text },
  change: { width: 110, fontSize: font.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
  adds: { color: colors.success },
  removes: { color: colors.danger },
});
