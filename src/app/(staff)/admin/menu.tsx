import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { loadAdminCatalog } from '@/lib/admin';
import { loadInventory, loadRecipeBook } from '@/lib/inventory';
import { formatMoney, toPiastres } from '@/lib/money';
import type { AdminCatalog, AdminMenuItem, InventoryItem, RecipeBook } from '@/lib/types';
import { EmptyState, ListRow, Panel, Segments } from '@/ui/admin/AdminKit';
import { CategoryForm, errorMessage, GroupEditor, ItemForm } from '@/ui/admin/MenuForms';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { colors, font, space } from '@/ui/theme';

type Mode = 'items' | 'groups';

type Editing =
  | { kind: 'category'; id: string | null }
  | { kind: 'item'; id: string | null }
  | { kind: 'group'; id: string | null }
  | null;

type Feedback = { tone: 'success' | 'danger'; message: string } | null;

const isOffEverywhere = (item: AdminMenuItem) => !item.isAvailablePos && !item.isAvailableWeb && !item.isAvailableTalabat;

function channelSummary(item: AdminMenuItem) {
  const channels = [item.isAvailablePos && 'POS', item.isAvailableWeb && 'Web', item.isAvailableTalabat && 'Talabat'].filter(Boolean);
  return channels.length > 0 ? channels.join(' · ') : 'Not sold anywhere';
}

export default function MenuAdminScreen() {
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [mode, setMode] = useState<Mode>('items');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeBook | null>(null);
  // Bumped whenever recipes reload so an open item form picks up the saved recipe.
  const [recipesVersion, setRecipesVersion] = useState(0);

  const apply = useCallback((loaded: AdminCatalog) => {
    setCatalog(loaded);
    setCategoryId((current) => current ?? loaded.categories[0]?.id ?? null);
  }, []);

  const applyRecipes = useCallback((book: RecipeBook, items: InventoryItem[]) => {
    setRecipes(book);
    setInventory(items);
    setRecipesVersion((current) => current + 1);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [loaded, book, items] = await Promise.all([loadAdminCatalog(), loadRecipeBook(), loadInventory()]);
      apply(loaded);
      applyRecipes(book, items);
    } catch (error) {
      setFeedback({ tone: 'danger', message: errorMessage(error) });
    }
  }, [apply, applyRecipes]);

  useEffect(() => {
    let active = true;
    Promise.all([loadAdminCatalog(), loadRecipeBook(), loadInventory()])
      .then(([loaded, book, items]) => {
        if (active) {
          apply(loaded);
          applyRecipes(book, items);
        }
      })
      .catch((error) => active && setFeedback({ tone: 'danger', message: errorMessage(error) }));
    return () => {
      active = false;
    };
  }, [apply, applyRecipes]);

  const open = (next: Editing) => {
    setEditing(next);
    setFeedback(null);
  };

  const saved = (message: string, next: Editing) => {
    void reload();
    setEditing(next);
    setFeedback({ tone: 'success', message });
  };

  const failed = (message: string) => setFeedback({ tone: 'danger', message });

  if (!catalog) {
    return feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : <EmptyState message="Loading the menu…" />;
  }

  const items = catalog.items
    .filter((item) => item.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const groups = [...catalog.modifierGroups].sort((a, b) => a.name.localeCompare(b.name));
  const editedCategory = editing?.kind === 'category' && editing.id ? catalog.categories.find((c) => c.id === editing.id) ?? null : null;
  const editedItem = editing?.kind === 'item' && editing.id ? catalog.items.find((i) => i.id === editing.id) ?? null : null;
  const editedGroup = editing?.kind === 'group' && editing.id ? catalog.modifierGroups.find((g) => g.id === editing.id) ?? null : null;

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Segments
          options={[
            { value: 'items', label: 'Categories & items' },
            { value: 'groups', label: 'Option groups' },
          ]}
          value={mode}
          onChange={(value: Mode) => {
            setMode(value);
            open(null);
          }}
        />
        <Text style={styles.summary}>
          {catalog.categories.length} categories · {catalog.items.length} items · {catalog.modifierGroups.length} option groups
        </Text>
      </View>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      {mode === 'items' ? (
        <View style={styles.columns}>
          <Panel title="Categories" style={styles.narrow} action={<Button label="+ Add" variant="secondary" onPress={() => open({ kind: 'category', id: null })} />}>
            {catalog.categories.map((category) => (
              <ListRow
                key={category.id}
                title={category.name}
                subtitle={`${catalog.items.filter((item) => item.categoryId === category.id).length} items`}
                badge={category.isActive ? null : 'Hidden'}
                badgeTone="danger"
                dimmed={!category.isActive}
                selected={category.id === categoryId}
                onPress={() => {
                  setCategoryId(category.id);
                  open({ kind: 'category', id: category.id });
                }}
              />
            ))}
            {catalog.categories.length === 0 ? <EmptyState message="Start by adding a category, like Hot drinks." /> : null}
          </Panel>

          <Panel
            title="Items"
            style={styles.middle}
            action={categoryId ? <Button label="+ Add item" onPress={() => open({ kind: 'item', id: null })} /> : null}>
            {items.map((item) => (
              <ListRow
                key={item.id}
                title={item.name}
                subtitle={`${formatMoney(toPiastres(item.basePrice))} EGP · ${channelSummary(item)}`}
                badge={!item.isInStock ? 'Sold out' : isOffEverywhere(item) ? 'Off' : null}
                badgeTone="danger"
                dimmed={isOffEverywhere(item)}
                selected={editing?.kind === 'item' && editing.id === item.id}
                onPress={() => open({ kind: 'item', id: item.id })}
              />
            ))}
            {categoryId && items.length === 0 ? <EmptyState message="No items in this category yet." /> : null}
          </Panel>

          <View style={styles.editor}>
            {editing?.kind === 'category' ? (
              <CategoryForm
                key={editing.id ?? 'new'}
                category={editedCategory}
                onSaved={(category, message) => {
                  setCategoryId(category.id);
                  saved(message, { kind: 'category', id: category.id });
                }}
                onDeleted={() => {
                  setCategoryId(null);
                  saved('The category was deleted.', null);
                }}
                onError={failed}
              />
            ) : editing?.kind === 'item' ? (
              <ItemForm
                key={`${editing.id ?? 'new'}-${recipesVersion}`}
                item={editedItem}
                catalog={catalog}
                defaultCategoryId={categoryId}
                inventory={inventory}
                recipe={editing.id ? recipes?.menuItems.find((recipe) => recipe.ownerId === editing.id) ?? null : null}
                onSaved={(item, message) => {
                  setCategoryId(item.categoryId);
                  saved(message, { kind: 'item', id: item.id });
                }}
                onError={failed}
              />
            ) : (
              <Panel>
                <EmptyState message="Tap a category or item to edit it. Changes reach the register straight away." />
              </Panel>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.columns}>
          <Panel title="Option groups" style={styles.narrow} action={<Button label="+ Add" variant="secondary" onPress={() => open({ kind: 'group', id: null })} />}>
            {groups.map((group) => (
              <ListRow
                key={group.id}
                title={group.name}
                subtitle={`${group.modifiers.length} options · ${group.isRequired ? 'required' : 'optional'} · up to ${group.maxSelection}`}
                badge={group.isActive ? null : 'Off'}
                badgeTone="danger"
                dimmed={!group.isActive}
                selected={editing?.kind === 'group' && editing.id === group.id}
                onPress={() => open({ kind: 'group', id: group.id })}
              />
            ))}
            {groups.length === 0 ? <EmptyState message="Option groups hold choices like Size or Milk. Add one, then attach it to items." /> : null}
          </Panel>
          <View style={styles.editor}>
            {editing?.kind === 'group' ? (
              <GroupEditor
                key={editing.id ?? 'new'}
                group={editedGroup}
                onSaved={(group, message) => saved(message, { kind: 'group', id: group.id })}
                onError={failed}
              />
            ) : (
              <Panel>
                <EmptyState message="Tap an option group to edit it and its options." />
              </Panel>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg },
  summary: { fontSize: font.small, color: colors.textMuted },
  columns: { flex: 1, flexDirection: 'row', gap: space.md },
  narrow: { width: 260 },
  middle: { width: 320 },
  editor: { flex: 1, gap: space.md },
});
