import { apiRequest } from './api';
import type { StaffRole } from './types';

// Clock-in / clock-out. Staff clock in with their PIN before signing in to the register; working
// times overlap freely and are separate from the cash drawer.

export interface OnDutyStaff {
  staffId: string;
  fullName: string;
  role: StaffRole;
  clockInAt: string;
}

export interface ClockResult {
  staffId: string;
  fullName: string;
  clockInAt: string;
  clockOutAt: string | null;
  minutesWorked: number;
}

export interface TimeEntry {
  id: string;
  staffId: string;
  staffName: string;
  clockInAt: string;
  clockOutAt: string | null;
  minutesWorked: number;
  editedByName: string | null;
  editedAt: string | null;
  editReason: string | null;
}

export interface AttendanceReport {
  from: string;
  to: string;
  totals: { staffId: string; staffName: string; entries: number; minutesWorked: number }[];
  entries: TimeEntry[];
}

export const fetchOnDuty = () => apiRequest<OnDutyStaff[]>('GET', '/api/v1/attendance/on-duty', { token: null });

export const clockIn = (staffId: string, pin: string) =>
  apiRequest<ClockResult>('POST', '/api/v1/attendance/clock-in', { body: { staffId, pin }, token: null });

export const clockOut = (staffId: string, pin: string) =>
  apiRequest<ClockResult>('POST', '/api/v1/attendance/clock-out', { body: { staffId, pin }, token: null });

export const loadAttendance = (from: string, to: string) =>
  apiRequest<AttendanceReport>('GET', `/api/v1/attendance?${new URLSearchParams({ from, to }).toString()}`);

export const editTimeEntry = (id: string, body: { clockInAt: string; clockOutAt: string | null; reason: string }) =>
  apiRequest<TimeEntry>('PUT', `/api/v1/attendance/${id}`, { body });

export const addTimeEntry = (body: { staffId: string; clockInAt: string; clockOutAt: string; reason: string }) =>
  apiRequest<TimeEntry>('POST', '/api/v1/attendance', { body });

/** 7h 05m */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}
