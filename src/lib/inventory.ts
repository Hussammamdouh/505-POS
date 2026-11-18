import { apiRequest } from './api';
import { refreshCatalog } from './catalog';
import type {
  ExpensePaymentSource,
  InventoryItem,
  InventoryMovement,
  InventoryTransaction,
  InventoryUnit,
  Recipe,
  RecipeBook,
  RecipeIngredient,
  RecipeSection,
} from './types';

export const loadInventory = () => apiRequest<InventoryItem[]>('GET', '/api/v1/inventory/items');

export interface SaveInventoryItemRequest {
  name: string;
  sku: string | null;
  unitOfMeasure: InventoryUnit;
  minStockAlert: number;
  costPerUnit: number;
  isActive: boolean;
  recipeSection: RecipeSection;
}

export const saveInventoryItem = (id: string | null, body: SaveInventoryItemRequest) =>
  id
    ? apiRequest<InventoryItem>('PUT', `/api/v1/inventory/items/${id}`, { body })
    : apiRequest<InventoryItem>('POST', '/api/v1/inventory/items', { body });

export interface RecordMovementRequest {
  inventoryItemId: string;
  movementType: Exclude<InventoryMovement, 'SALE_DEPLETION' | 'ORDER_REFUND_RESTOCK'>;
  quantity: number;
  entryUnit: InventoryUnit | null;
  totalCost: number | null;
  paymentSource: ExpensePaymentSource | null;
  supplierName: string | null;
  reasonNotes: string | null;
}

export const recordMovement = (body: RecordMovementRequest) => apiRequest<InventoryItem>('POST', '/api/v1/inventory/transactions', { body });

export const loadMovements = (itemId: string) =>
  apiRequest<InventoryTransaction[]>('GET', `/api/v1/inventory/transactions?itemId=${itemId}`);

export const loadRecipeBook = () => apiRequest<RecipeBook>('GET', '/api/v1/inventory/recipes');

// Recipes change item costs (and so the register's cached menu is refreshed).
export async function saveItemRecipe(menuItemId: string, ingredients: RecipeIngredient[]) {
  const saved = await apiRequest<Recipe>('PUT', `/api/v1/inventory/recipes/${menuItemId}`, { body: { ingredients } });
  void refreshCatalog().catch(() => undefined);
  return saved;
}

export async function saveModifierRecipe(modifierId: string, ingredients: RecipeIngredient[], swapInventoryItemId: string | null = null) {
  const saved = await apiRequest<Recipe>('PUT', `/api/v1/inventory/modifiers/${modifierId}/recipe`, {
    body: { ingredients, swapInventoryItemId },
  });
  void refreshCatalog().catch(() => undefined);
  return saved;
}

export const UNIT_LABELS: Record<InventoryUnit, string> = { G: 'g', KG: 'kg', ML: 'ml', L: 'L', UNIT: 'units' };

/** The larger unit staff may type instead (kg for grams, L for millilitres). */
export const BIG_UNIT: Partial<Record<InventoryUnit, InventoryUnit>> = { G: 'KG', ML: 'L' };

/** Shows 12500 ml as "12.5 L" and 750 g as "750 g", trimming trailing zeros. */
export function formatQuantity(quantity: number, unit: InventoryUnit): string {
  const big = BIG_UNIT[unit];
  if (big && Math.abs(quantity) >= 1000) {
    return `${trim(quantity / 1000)} ${UNIT_LABELS[big]}`;
  }

  return `${trim(quantity)} ${UNIT_LABELS[unit]}`;
}

const trim = (value: number) => String(Math.round(value * 1000) / 1000);

export interface RecipeSectionInfo {
  section: RecipeSection;
  title: string;
  /** "one" sections take a single ingredient (or none); "many" sections take any number. */
  mode: 'one' | 'many';
  noneLabel: string;
  help: string;
}

/** The steps of the recipe builder, in order. */
export const RECIPE_SECTIONS: RecipeSectionInfo[] = [
  { section: 'CUP', title: 'Cup', mode: 'one', noneLabel: 'No cup', help: 'Hot cup or iced cup' },
  { section: 'COFFEE', title: 'Coffee', mode: 'one', noneLabel: 'No coffee', help: 'How many grams of coffee' },
  { section: 'MILK', title: 'Milk', mode: 'one', noneLabel: 'No milk', help: 'How much milk. Oat, coconut and other milk options use this same amount' },
  { section: 'SYRUP', title: 'Syrups', mode: 'many', noneLabel: 'No syrup', help: 'Each syrup and how much. Syrup options swap in at this amount' },
  { section: 'SAUCE', title: 'Sauces', mode: 'many', noneLabel: 'No sauce', help: 'Each sauce and how much. Sauce options swap in at this amount' },
  { section: 'ADD_ON', title: 'Add-ons', mode: 'many', noneLabel: 'No add-ons', help: 'Ice, cream, toppings…' },
  { section: 'OTHER', title: 'Other', mode: 'many', noneLabel: 'Nothing else', help: 'Lids, straws, sleeves, anything else' },
];

export const RECIPE_SECTION_LABELS: Record<RecipeSection, string> = {
  CUP: 'Cup',
  COFFEE: 'Coffee',
  MILK: 'Milk',
  SYRUP: 'Syrup',
  SAUCE: 'Sauce',
  ADD_ON: 'Add-on',
  OTHER: 'Other',
};
