import { useApp, type CachedShift } from '@/store/app';

import { ApiError, apiRequest } from './api';
import { kvSet } from './db';
import type { CurrentShift } from './types';

export const SHIFT_KEY = 'current-shift';

export async function refreshShift(): Promise<CurrentShift | null> {
  try {
    const shift = await apiRequest<CurrentShift>('GET', '/api/v1/shifts/current');
    await rememberShift({ id: shift.id, staffName: shift.staffName, openedAt: shift.openedAt });
    return shift;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await rememberShift(null);
      return null;
    }

    throw error;
  }
}

export async function rememberShift(shift: CachedShift | null) {
  await kvSet(SHIFT_KEY, shift);
  useApp.getState().set({ shift });
}
