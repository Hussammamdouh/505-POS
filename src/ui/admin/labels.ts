import type { DiscountType, ExpenseCategory, ExpensePaymentSource, LoyaltyRewardType, PromoState, RecurringFrequency } from '@/lib/types';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: 'Rent',
  ELECTRICITY: 'Electricity',
  WATER: 'Water',
  STAFF_PAYROLL: 'Staff salaries',
  STAFF_BONUS_OVERTIME: 'Bonus & overtime',
  MAINTENANCE_REPAIRS: 'Maintenance & repairs',
  PACKAGING_CONSUMABLES: 'Packaging & supplies',
  MARKETING_ADS: 'Marketing & ads',
  GOVERNMENT_PERMITS: 'Permits & fees',
  MISCELLANEOUS: 'Other',
};

export const PAYMENT_SOURCE_LABELS: Record<ExpensePaymentSource, string> = {
  DRAWER_CASH: 'Drawer cash',
  SAFE_CASH: 'Safe',
  BANK_TRANSFER: 'Bank transfer',
  COMPANY_CARD: 'Company card',
  OWNER_CASH: "Owner's cash",
};

// Drawer cash must go through a payout on the open shift, and the cafe has no safe.
export const MANUAL_EXPENSE_SOURCES: ExpensePaymentSource[] = ['OWNER_CASH', 'BANK_TRANSFER', 'COMPANY_CARD'];
export const RECURRING_SOURCES: ExpensePaymentSource[] = ['BANK_TRANSFER', 'OWNER_CASH', 'COMPANY_CARD', 'DRAWER_CASH'];

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = { PERCENTAGE: 'Percent off', FIXED_AMOUNT: 'Amount off (EGP)' };

export const REWARD_TYPE_LABELS: Record<LoyaltyRewardType, string> = { FIXED_DISCOUNT: 'Discount (EGP)', FREE_ITEM: 'Free item' };

export const PROMO_STATE: Record<PromoState, { label: string; tone: 'success' | 'muted' | 'danger' }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  SCHEDULED: { label: 'Scheduled', tone: 'muted' },
  EXPIRED: { label: 'Expired', tone: 'danger' },
  EXHAUSTED: { label: 'Used up', tone: 'danger' },
  DISABLED: { label: 'Off', tone: 'danger' },
};

export const optionsOf = <T extends string>(labels: Record<T, string>, only?: T[]) =>
  (only ?? (Object.keys(labels) as T[])).map((value) => ({ value, label: labels[value] }));
