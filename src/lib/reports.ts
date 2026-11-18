import { apiRequest } from './api';
import { addDays, startOfBusinessDate } from './businessDay';
import type {
  BreakEvenToday,
  CashFlowSummary,
  FinancialStatement,
  ItemProfitability,
  SalesInsights,
  ShiftListItem,
  StaffMonth,
  StaffReport,
} from './types';

export interface DateRange {
  from: string;
  to: string;
}

const query = ({ from, to }: DateRange) => `from=${from}&to=${to}`;

export const loadStatement = (range: DateRange) => apiRequest<FinancialStatement>('GET', `/api/v1/finance/statement?${query(range)}`);

export const loadCashFlow = (range: DateRange) => apiRequest<CashFlowSummary>('GET', `/api/v1/finance/cash-flow?${query(range)}`);

export const loadBreakEvenToday = () => apiRequest<BreakEvenToday>('GET', '/api/v1/finance/break-even/today');

export const loadStaffReport = (range: DateRange) => apiRequest<StaffReport>('GET', `/api/v1/finance/staff-report?${query(range)}`);

// Shifts are filtered by when they opened, as UTC instants covering the Cairo business dates.
export const loadShifts = ({ from, to }: DateRange) =>
  apiRequest<ShiftListItem[]>(
    'GET',
    `/api/v1/shifts?from=${encodeURIComponent(startOfBusinessDate(from).toISOString())}&to=${encodeURIComponent(
      startOfBusinessDate(addDays(to, 1)).toISOString(),
    )}`,
  );

export const loadSalesInsights = (range: DateRange) => apiRequest<SalesInsights>('GET', `/api/v1/finance/sales-insights?${query(range)}`);

export const loadItemProfitability = (range: DateRange) =>
  apiRequest<ItemProfitability>('GET', `/api/v1/finance/item-profitability?${query(range)}`);

/** Reports → Staff: attendance, penalties, loans and salary after them for one month ("2026-11"). */
export const loadStaffMonth = (month: string) => apiRequest<StaffMonth>('GET', `/api/v1/finance/staff-month?month=${month}`);
