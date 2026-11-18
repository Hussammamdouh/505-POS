import { apiRequest } from './api';
import type { Offer } from './discounts';
import { refreshCatalog } from './catalog';
import type {
  AdminCatalog,
  AdminCategory,
  AdminMenuItem,
  AdminModifier,
  AdminModifierGroup,
  DiscountType,
  Expense,
  ExpenseCategory,
  ExpensePaymentSource,
  LoyaltyRewardAdmin,
  PromoCode,
  RecurringFrequency,
  RecurringOverhead,
  SaveMenuItemRequest,
  StaffRole,
  StaffSummary,
} from './types';

// Menu edits change what the register sells, so refresh its cached catalog after each one.
async function withCatalogRefresh<T>(request: Promise<T>): Promise<T> {
  const result = await request;
  void refreshCatalog().catch(() => undefined);
  return result;
}

export const loadAdminCatalog = () => apiRequest<AdminCatalog>('GET', '/api/v1/admin/catalog');

export type SaveCategoryRequest = Omit<AdminCategory, 'id'>;

export const saveCategory = (id: string | null, body: SaveCategoryRequest) =>
  withCatalogRefresh(
    id
      ? apiRequest<AdminCategory>('PUT', `/api/v1/admin/categories/${id}`, { body })
      : apiRequest<AdminCategory>('POST', '/api/v1/admin/categories', { body }),
  );

export const deleteCategory = (id: string) => withCatalogRefresh(apiRequest<void>('DELETE', `/api/v1/admin/categories/${id}`));

export const saveMenuItem = (id: string | null, body: SaveMenuItemRequest) =>
  withCatalogRefresh(
    id
      ? apiRequest<AdminMenuItem>('PUT', `/api/v1/admin/items/${id}`, { body })
      : apiRequest<AdminMenuItem>('POST', '/api/v1/admin/items', { body }),
  );

export interface SaveModifierGroupRequest {
  name: string;
  minSelection: number;
  maxSelection: number;
  isActive: boolean;
}

export const saveModifierGroup = (id: string | null, body: SaveModifierGroupRequest) =>
  withCatalogRefresh(
    id
      ? apiRequest<AdminModifierGroup>('PUT', `/api/v1/admin/modifier-groups/${id}`, { body })
      : apiRequest<AdminModifierGroup>('POST', '/api/v1/admin/modifier-groups', { body }),
  );

export interface SaveModifierRequest {
  name: string;
  extraPrice: number;
  estimatedMaterialCost: number;
  isDefault: boolean;
  sortOrder: number;
}

export const saveModifier = (groupId: string, id: string | null, body: SaveModifierRequest) =>
  withCatalogRefresh(
    id
      ? apiRequest<AdminModifier>('PUT', `/api/v1/admin/modifiers/${id}`, { body })
      : apiRequest<AdminModifier>('POST', `/api/v1/admin/modifier-groups/${groupId}/modifiers`, { body }),
  );

export const loadStaff = () => apiRequest<StaffSummary[]>('GET', '/api/v1/admin/staff');

/** salaryStartsOn: "Salary counts from" (business date); null keeps the current start, or the 1st of this month for a new salary. */
type StaffPay = { monthlySalary: number | null; workingDaysPerMonth: number | null; salaryStartsOn: string | null };

export const createStaff = (body: { fullName: string; role: StaffRole; phone: string | null; pin: string } & StaffPay) =>
  apiRequest<StaffSummary>('POST', '/api/v1/admin/staff', { body });

export const updateStaff = (id: string, body: { fullName: string; role: StaffRole; phone: string | null; isActive: boolean } & StaffPay) =>
  apiRequest<StaffSummary>('PUT', `/api/v1/admin/staff/${id}`, { body });

export const resetStaffPin = (id: string, pin: string) => apiRequest<void>('PUT', `/api/v1/admin/staff/${id}/pin`, { body: { pin } });

export interface SavePromoRequest {
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCap: number | null;
  minOrderAmount: number;
  maxTotalUses: number | null;
  maxUsesPerCustomer: number;
  startsAt: string;
  expiresAt: string | null;
  /** Whether the cashier can type it at the register (it always works on the website). */
  isValidOnPos: boolean;
}

export type SaveOfferRequest = Omit<Offer, 'id'>;

export const loadOffers = () => apiRequest<Offer[]>('GET', '/api/v1/admin/offers');

export const saveOffer = (id: string | null, body: SaveOfferRequest) =>
  id ? apiRequest<Offer>('PUT', `/api/v1/admin/offers/${id}`, { body }) : apiRequest<Offer>('POST', '/api/v1/admin/offers', { body });

export interface LoyaltyCardSettings {
  ordersForReward: number;
  freeDrinkCap: number | null;
  isActive: boolean;
}

export const loadCardSettings = () => apiRequest<LoyaltyCardSettings>('GET', '/api/v1/admin/loyalty-card');

export const saveCardSettings = (body: LoyaltyCardSettings) => apiRequest<LoyaltyCardSettings>('PUT', '/api/v1/admin/loyalty-card', { body });

export const loadPromos = () => apiRequest<PromoCode[]>('GET', '/api/v1/promos');

export const createPromo = (body: SavePromoRequest & { code: string }) => apiRequest<PromoCode>('POST', '/api/v1/promos', { body });

export const updatePromo = (id: string, body: SavePromoRequest & { isActive: boolean }) =>
  apiRequest<PromoCode>('PUT', `/api/v1/promos/${id}`, { body });

export type SaveRewardRequest = Omit<LoyaltyRewardAdmin, 'id' | 'timesRedeemed' | 'createdAt'>;

export const loadRewards = () => apiRequest<LoyaltyRewardAdmin[]>('GET', '/api/v1/loyalty/rewards');

export const saveReward = (id: string | null, body: SaveRewardRequest) =>
  id
    ? apiRequest<LoyaltyRewardAdmin>('PUT', `/api/v1/loyalty/rewards/${id}`, { body })
    : apiRequest<LoyaltyRewardAdmin>('POST', '/api/v1/loyalty/rewards', { body });

export const loadExpenses = (from: string, to: string) =>
  apiRequest<Expense[]>('GET', `/api/v1/finance/expenses?from=${from}&to=${to}`);

export interface RecordExpenseRequest {
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentSource: ExpensePaymentSource;
  incurredDate: string | null;
  recurringExpenseId: string | null;
  invoiceNumber: string | null;
  receiptImageUrl: string | null;
  notes: string | null;
}

export const recordExpense = (body: RecordExpenseRequest) => apiRequest<Expense>('POST', '/api/v1/finance/expenses', { body });

export const loadRecurring = () => apiRequest<RecurringOverhead[]>('GET', '/api/v1/finance/recurring');

export const createRecurring = (body: {
  title: string;
  category: ExpenseCategory;
  amount: number;
  frequency: RecurringFrequency;
  effectiveFrom: string;
  effectiveUntil: string | null;
}) => apiRequest<RecurringOverhead>('POST', '/api/v1/finance/recurring', { body });

export const updateRecurring = (id: string, body: { effectiveUntil: string | null; isActive: boolean }) =>
  apiRequest<RecurringOverhead>('PUT', `/api/v1/finance/recurring/${id}`, { body });
