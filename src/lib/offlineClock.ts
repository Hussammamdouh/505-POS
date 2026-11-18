import { newId } from './ids';

import { apiRequest } from './api';
import type { OnDutyStaff } from './attendance';
import { loginOffline } from './auth';
import { kvGet, kvSet } from './db';

// Clocking in and out while the internet is down. The iPad checks the PIN against the copy it keeps
// for anyone who signed in here online before, saves the event, and uploads it when it can: with
// the person's next sign-in, or with the regular sync.

export interface PendingClockEvent {
  id: string;
  staffId: string;
  fullName: string;
  kind: 'IN' | 'OUT';
  occurredAt: string;
}

const PENDING_KEY = 'pending-clock-events';
const ON_DUTY_KEY = 'on-duty-cache';

export const pendingClockEvents = async () => (await kvGet<PendingClockEvent[]>(PENDING_KEY)) ?? [];

/** Remembers who the server last said was on duty, for when the internet is down. */
export const rememberOnDuty = (staff: OnDutyStaff[]) => kvSet(ON_DUTY_KEY, staff);

/** Who is on duty as far as this iPad knows: the last list from the server plus anything clocked here offline. */
export async function localOnDuty(): Promise<OnDutyStaff[]> {
  const onDuty = new Map(((await kvGet<OnDutyStaff[]>(ON_DUTY_KEY)) ?? []).map((entry) => [entry.staffId, entry]));
  for (const event of await pendingClockEvents()) {
    if (event.kind === 'IN') {
      onDuty.set(event.staffId, { staffId: event.staffId, fullName: event.fullName, role: onDuty.get(event.staffId)?.role ?? 'BARISTA', clockInAt: event.occurredAt });
    } else {
      onDuty.delete(event.staffId);
    }
  }

  return [...onDuty.values()];
}

/**
 * Clocks someone in or out without the server. Returns null when the PIN can't be checked here:
 * it's wrong, or the person has never signed in on this iPad while online.
 */
export async function clockOffline(staffId: string, pin: string): Promise<PendingClockEvent | null> {
  const session = await loginOffline(staffId, pin);
  if (!session) {
    return null;
  }

  const onDuty = await localOnDuty();
  const event: PendingClockEvent = {
    id: newId(),
    staffId,
    fullName: session.fullName,
    kind: onDuty.some((entry) => entry.staffId === staffId) ? 'OUT' : 'IN',
    occurredAt: new Date().toISOString(),
  };
  await kvSet(PENDING_KEY, [...(await pendingClockEvents()), event]);
  return event;
}

/** Saves a clock-in on this iPad for someone whose PIN was just checked; it is sent with their next sign-in or sync. */
export async function recordClockIn(staffId: string, fullName: string): Promise<PendingClockEvent> {
  const event: PendingClockEvent = { id: newId(), staffId, fullName, kind: 'IN', occurredAt: new Date().toISOString() };
  await kvSet(PENDING_KEY, [...(await pendingClockEvents()), event]);
  return event;
}

const toWire = (event: PendingClockEvent) => ({ id: event.id, staffId: event.staffId, kind: event.kind, occurredAt: event.occurredAt });

/** One person's saved events, sent along with their PIN sign-in so they count before the clock-in check. */
export async function pendingClockEventsFor(staffId: string) {
  return (await pendingClockEvents()).filter((event) => event.staffId === staffId).map(toWire);
}

export async function forgetClockEvents(ids: string[]) {
  const sent = new Set(ids);
  await kvSet(PENDING_KEY, (await pendingClockEvents()).filter((event) => !sent.has(event.id)));
}

/** Uploads every saved event with a signed-in token; the server ignores ones it already has. */
export async function syncClockEvents(token: string) {
  const pending = await pendingClockEvents();
  if (pending.length === 0) {
    return;
  }

  const results = await apiRequest<{ id: string; outcome: string }[]>('POST', '/api/v1/attendance/offline-sync', {
    body: { events: pending.map(toWire) },
    token,
  });
  await forgetClockEvents(results.map((result) => result.id));
}
