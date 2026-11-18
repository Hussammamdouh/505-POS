import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { apiRequest } from './api';
import { kvGet, kvSet } from './db';
import { secureDelete, secureGet, secureSet } from './secureStorage';
import type { StaffAuthResponse, StaffLoginTile, StaffRole } from './types';

export interface StaffSession {
  staffId: string;
  fullName: string;
  role: StaffRole;
  token: string | null;
}

interface PinVerifier {
  salt: string;
  hash: string;
  iterations: number;
  fullName: string;
  role: StaffRole;
}

const PIN_ITERATIONS = 20000;
const STAFF_TILES_KEY = 'staff-tiles';
const SYNC_TOKEN_KEY = 'sync_token';
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;

const verifierKey = (staffId: string) => `pin_${staffId}`;

const derive = async (pin: string, saltHex: string, iterations: number) =>
  bytesToHex(await pbkdf2Async(sha256, pin, Buffer.from(saltHex, 'hex'), { c: iterations, dkLen: 32 }));

export async function fetchStaffTiles(): Promise<StaffLoginTile[]> {
  const tiles = await apiRequest<StaffLoginTile[]>('GET', '/api/v1/auth/staff', { token: null });
  await kvSet(STAFF_TILES_KEY, tiles);
  return tiles;
}

export const cachedStaffTiles = async () => (await kvGet<StaffLoginTile[]>(STAFF_TILES_KEY)) ?? [];

export async function loginOnline(
  staffId: string,
  pin: string,
  pendingClockEvents: unknown[] = [],
  viewOnly = false,
  /** True when the PIN was just checked against this iPad's saved copy, so it need not be hashed again (slow). */
  verifiedLocally = false,
): Promise<StaffSession> {
  const response = await apiRequest<StaffAuthResponse>('POST', '/api/v1/auth/pin-login', {
    body: { staffId, pin, pendingClockEvents, viewOnly },
    token: null,
  });

  const stored = verifiedLocally ? await secureGet(verifierKey(staffId)) : null;
  if (stored) {
    await secureSet(verifierKey(staffId), JSON.stringify({ ...(JSON.parse(stored) as PinVerifier), fullName: response.fullName, role: response.role }));
  } else {
    await saveVerifier(staffId, pin, response.fullName, response.role);
  }

  await secureSet(SYNC_TOKEN_KEY, response.jwtToken);

  return { staffId: response.staffId, fullName: response.fullName, role: response.role, token: response.jwtToken };
}

async function saveVerifier(staffId: string, pin: string, fullName: string, role: StaffRole) {
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  const verifier: PinVerifier = { salt, hash: await derive(pin, salt, PIN_ITERATIONS), iterations: PIN_ITERATIONS, fullName, role };
  await secureSet(verifierKey(staffId), JSON.stringify(verifier));
}

export async function hasOfflineVerifier(staffId: string): Promise<boolean> {
  return (await secureGet(verifierKey(staffId))) !== null;
}

export async function loginOffline(staffId: string, pin: string): Promise<StaffSession | null> {
  const stored = await secureGet(verifierKey(staffId));
  if (!stored) {
    return null;
  }

  const verifier = JSON.parse(stored) as PinVerifier;
  const candidate = await derive(pin, verifier.salt, verifier.iterations);
  if (!constantTimeEquals(candidate, verifier.hash)) {
    return null;
  }

  return { staffId, fullName: verifier.fullName, role: verifier.role, token: null };
}

export async function forgetOfflineVerifier(staffId: string) {
  await secureDelete(verifierKey(staffId));
}

export async function usableSyncToken(): Promise<string | null> {
  const token = await secureGet(SYNC_TOKEN_KEY);
  return token && !isExpired(token) ? token : null;
}

export function isExpired(jwt: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload.exp !== 'number' || payload.exp * 1000 - TOKEN_EXPIRY_MARGIN_MS < Date.now();
  } catch {
    return true;
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}
