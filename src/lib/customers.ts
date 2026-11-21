import { apiRequest } from './api';
import type { LoyaltyCustomerList, LoyaltyCustomerOrder } from './types';

export type CustomerSource = 'all' | 'website' | 'instore';
export type CustomerSort = 'recent' | 'orders' | 'spent' | 'stamps' | 'newest';

export const loadCustomers = (search: string, source: CustomerSource, sort: CustomerSort) =>
  apiRequest<LoyaltyCustomerList>(
    'GET',
    `/api/v1/admin/customers?search=${encodeURIComponent(search.trim())}&source=${source}&sort=${sort}`,
  );

export const loadCustomerOrders = (customerId: string) =>
  apiRequest<LoyaltyCustomerOrder[]>('GET', `/api/v1/admin/customers/${customerId}/orders`);
