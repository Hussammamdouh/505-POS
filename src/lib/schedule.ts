import { apiRequest } from './api';

// Staff schedule (named shifts + a weekly pattern per person + single-day changes) and the penalties
// worked out from it. Times of day are "HH:mm" in Cairo; penalties are in days of pay (0.5 = half a day).

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  endsNextDay: boolean;
}

export interface AttendanceRules {
  graceMinutes: number;
  latePenaltyDays: number;
  earlyLeavePenaltyDays: number;
  noShowPenaltyDays: number;
}

export interface Schedule {
  templates: ShiftTemplate[];
  /** weekday: 0 = Sunday ... 6 = Saturday */
  assignments: { staffId: string; weekday: number; shiftTemplateId: string }[];
  upcomingOverrides: { staffId: string; date: string; shiftTemplateId: string | null; shiftName: string | null; reason: string | null }[];
  settings: AttendanceRules;
}

export type PenaltyKind = 'LATE' | 'EARLY_LEAVE' | 'NO_SHOW';

export interface PenaltyLine {
  kind: PenaltyKind;
  minutes: number;
  days: number;
  waived: boolean;
  waiverReason: string | null;
  waivedByName: string | null;
}

export type ShiftStatus = 'UPCOMING' | 'NOT_IN_YET' | 'ON_DUTY' | 'DONE' | 'NO_SHOW';

export interface ScheduledShift {
  staffId: string;
  staffName: string;
  date: string;
  shiftName: string;
  scheduledStart: string;
  scheduledEnd: string;
  fromOverride: boolean;
  clockInAt: string | null;
  clockOutAt: string | null;
  status: ShiftStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  penalties: PenaltyLine[];
}

export interface AttendanceDay {
  date: string;
  settings: AttendanceRules;
  shifts: ScheduledShift[];
  events: { staffId: string; staffName: string; kind: 'IN' | 'OUT'; at: string; edited: boolean }[];
}

/** One penalty: automatic (from the schedule) or MANUAL (given by a manager; has an id so it can be removed). */
export interface PenaltyItem {
  id: string | null;
  staffId: string;
  staffName: string;
  date: string;
  kind: PenaltyKind | 'MANUAL';
  days: number;
  why: string;
  waived: boolean;
  waiverReason: string | null;
  /** Who gave a manual penalty, or who waived an automatic one. */
  byName: string | null;
}

/** One month of penalties. A locked month (salaries paid) is a frozen copy and can't change. */
export interface PenaltyLedger {
  month: string;
  from: string;
  to: string;
  settings: AttendanceRules;
  /** dailyRate and amount (EGP) are null when the person has no salary set. */
  staff: { staffId: string; staffName: string; count: number; days: number; waivedDays: number; dailyRate: number | null; amount: number | null }[];
  items: PenaltyItem[];
  totalAmount: number;
  locked: boolean;
  lockedAt: string | null;
  lockedByName: string | null;
}

export const PENALTY_LABELS: Record<PenaltyKind | 'MANUAL', string> = { LATE: 'Late', EARLY_LEAVE: 'Left early', NO_SHOW: 'No-show', MANUAL: 'Given by manager' };

export const STATUS_LABELS: Record<ShiftStatus, string> = {
  UPCOMING: 'Upcoming',
  NOT_IN_YET: 'Not in yet',
  ON_DUTY: 'On duty',
  DONE: 'Done',
  NO_SHOW: 'No-show',
};

/** Saturday first, as the week runs in Egypt. */
export const WEEKDAYS: { weekday: number; short: string }[] = [
  { weekday: 6, short: 'Sat' },
  { weekday: 0, short: 'Sun' },
  { weekday: 1, short: 'Mon' },
  { weekday: 2, short: 'Tue' },
  { weekday: 3, short: 'Wed' },
  { weekday: 4, short: 'Thu' },
  { weekday: 5, short: 'Fri' },
];

export const loadSchedule = () => apiRequest<Schedule>('GET', '/api/v1/schedule');

export const createShiftTemplate = (body: { name: string; startTime: string; endTime: string; isActive: boolean }) =>
  apiRequest<ShiftTemplate>('POST', '/api/v1/schedule/templates', { body });

export const updateShiftTemplate = (id: string, body: { name: string; startTime: string; endTime: string; isActive: boolean }) =>
  apiRequest<ShiftTemplate>('PUT', `/api/v1/schedule/templates/${id}`, { body });

export const setWeeklyPattern = (staffId: string, days: { weekday: number; shiftTemplateId: string | null }[]) =>
  apiRequest<Schedule>('PUT', `/api/v1/schedule/staff/${staffId}/week`, { body: { days } });

export const setDayChange = (body: { staffId: string; date: string; shiftTemplateId: string | null; reason: string | null }) =>
  apiRequest<Schedule>('PUT', '/api/v1/schedule/overrides', { body });

export const clearDayChange = (staffId: string, date: string) => apiRequest<Schedule>('DELETE', `/api/v1/schedule/overrides/${staffId}/${date}`);

export const saveAttendanceRules = (body: AttendanceRules) => apiRequest<AttendanceRules>('PUT', '/api/v1/schedule/settings', { body });

export const loadAttendanceDay = (date: string) => apiRequest<AttendanceDay>('GET', `/api/v1/attendance/day?date=${date}`);

/** month: "2026-10" */
export const loadPenalties = (month: string) => apiRequest<PenaltyLedger>('GET', `/api/v1/penalties?month=${month}`);

export const lockPenaltyMonth = (month: string) => apiRequest<PenaltyLedger>('POST', `/api/v1/penalties/months/${month}/lock`);

export const unlockPenaltyMonth = (month: string) => apiRequest<PenaltyLedger>('POST', `/api/v1/penalties/months/${month}/unlock`);

export const addPenalty = (body: { staffId: string; date: string; days: number; reason: string }) =>
  apiRequest<PenaltyItem>('POST', '/api/v1/penalties', { body });

export const removePenalty = (id: string) => apiRequest<void>('DELETE', `/api/v1/penalties/${id}`);

/** Quick choices for a penalty in days. */
export const DAY_CHOICES = [0.25, 0.5, 1, 2, 3];

/** ½ day, 1 day, 1½ days, 2 days, ¼ day */
export function formatDays(days: number): string {
  const whole = Math.floor(days);
  const fraction = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[Math.round((days - whole) * 4) / 4 as 0 | 0.25 | 0.5 | 0.75] ?? '';
  const text = `${whole > 0 ? whole : ''}${fraction}` || '0';
  return `${text} ${days > 1 ? 'days' : 'day'}`;
}

export const waivePenalty = (body: { staffId: string; date: string; kind: PenaltyKind; reason: string }) =>
  apiRequest<ScheduledShift>('POST', '/api/v1/attendance/waivers', { body });

/** 1h 05m, or 25m under an hour. */
export function formatMinutes(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}
