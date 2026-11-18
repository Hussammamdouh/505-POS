import { toPiastres, type Piastres } from './money';
import type { CatalogItem, PosOrderLineRequest } from './types';

export const MAX_QUANTITY_PER_LINE = 100;

export interface CartModifier {
  id: string;
  name: string;
  extraPrice: Piastres;
}

export interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  unitBasePrice: Piastres;
  modifiers: CartModifier[];
  quantity: number;
}

export const unitPrice = (line: CartLine): Piastres =>
  line.unitBasePrice + line.modifiers.reduce((sum, modifier) => sum + modifier.extraPrice, 0);

export const lineTotal = (line: CartLine): Piastres => unitPrice(line) * line.quantity;

export const cartSubtotal = (lines: CartLine[]): Piastres => lines.reduce((sum, line) => sum + lineTotal(line), 0);

export function defaultSelection(item: CatalogItem): string[] {
  return item.modifierGroups
    .filter((group) => group.minSelection >= 1)
    .flatMap((group) => group.modifiers.filter((modifier) => modifier.isDefault && modifier.isInStock).slice(0, group.maxSelection))
    .map((modifier) => modifier.id);
}

export function validateSelection(item: CatalogItem, selectedIds: string[]): string | null {
  for (const group of item.modifierGroups) {
    const selected = group.modifiers.filter((modifier) => selectedIds.includes(modifier.id));
    if (selected.length < group.minSelection) {
      return `Choose at least ${group.minSelection} from ${group.name}.`;
    }

    if (selected.length > group.maxSelection) {
      return `Choose at most ${group.maxSelection} from ${group.name}.`;
    }

    const outOfStock = selected.find((modifier) => !modifier.isInStock);
    if (outOfStock) {
      return `${outOfStock.name} is out of stock.`;
    }
  }

  return null;
}

export const canQuickAdd = (item: CatalogItem): boolean => validateSelection(item, defaultSelection(item)) === null;

export function toCartLine(item: CatalogItem, selectedIds: string[], quantity: number): CartLine {
  const modifiers = item.modifierGroups
    .flatMap((group) => group.modifiers)
    .filter((modifier) => selectedIds.includes(modifier.id))
    .map((modifier) => ({ id: modifier.id, name: modifier.name, extraPrice: toPiastres(modifier.extraPrice) }));

  return {
    key: `${item.id}:${modifiers.map((modifier) => modifier.id).sort().join(',')}`,
    menuItemId: item.id,
    name: item.name,
    unitBasePrice: toPiastres(item.basePrice),
    modifiers,
    quantity,
  };
}

export const toLineRequest = (line: CartLine): PosOrderLineRequest => ({
  menuItemId: line.menuItemId,
  quantity: line.quantity,
  unitBasePrice: line.unitBasePrice / 100,
  modifiers: line.modifiers.map((modifier) => ({ modifierId: modifier.id, extraPrice: modifier.extraPrice / 100 })),
});
