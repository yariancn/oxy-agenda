import { ALL_CLINICS } from './clinicAccess.js';
import { CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from './clinicRegistry.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { readStaffDeviceFromRequest } from './staffDeviceTrust.js';
import {
  assertLoginNotLocked,
  clearLoginAttempts,
  lockoutMinutesRemaining,
  recordLoginFailure,
} from './staffLoginRateLimit.js';
import { resolveStaffLoginWithCredentials, resolveStaffUserByEmail } from './staffLoginResolve.js';
import { normalizeStaffEmail } from './staffEmail.js';
import { isDevicePinFresh } from './staffDeviceTrust.js';

function stripPin(profile) {
  if (!profile || typeof profile !== 'object') return profile;
  const { pin, ...rest } = profile;
  return rest;
}

function sanitizeUser(user) {
  if (!user) return user;
  if (user.clinicProfiles) {
    const clinicProfiles = {};
    for (const [clinic, profile] of Object.entries(user.clinicProfiles)) {
      clinicProfiles[clinic] = stripPin(profile);
    }
    return { ...stripPin(user), clinicProfiles };
  }
  return stripPin(user);
}

function isBreakGlassPin(pin) {
  const normalizedPin = String(pin || '').trim();
  const supremePin = String(process.env.STAFF_SUPREME_PIN || '1234567890').trim();
  return normalizedPin === supremePin;
}

export async function resolveStaffLoginServer({ email = '', pin, request = null, skipRateLimit = false } = {}) {
  const normalizedPin = String(pin || '').trim();
  if (!normalizedPin) return { error: 'empty' };

  const supabaseGdl = getSupabaseAdmin(CLINIC_OXYGENDGL);
  const supabaseShenandoah = getSupabaseAdmin(CLINIC_SHENANDOAH);
  const trustedDevice = request ? readStaffDeviceFromRequest(request) : null;
  const trustedEmail = trustedDevice?.email || '';
  const loginEmail = normalizeStaffEmail(email) || trustedEmail;

  if (!isBreakGlassPin(normalizedPin) && loginEmail && !skipRateLimit) {
    const lock = await assertLoginNotLocked(supabaseGdl, loginEmail);
    if (!lock.ok) {
      return {
        error: 'locked',
        lockedMinutes: lockoutMinutesRemaining(lock.lockedUntil),
      };
    }
  }

  const result = await resolveStaffLoginWithCredentials({
    email: loginEmail,
    pin: normalizedPin,
    trustedEmail,
    supabaseGdl,
    supabaseShenandoah,
  });

  if (result.error) {
    if (loginEmail && !isBreakGlassPin(normalizedPin)) {
      await recordLoginFailure(supabaseGdl, loginEmail);
    }
    return result;
  }

  if (result.loginEmail) {
    await clearLoginAttempts(supabaseGdl, result.loginEmail);
  }

  return { user: sanitizeUser(result.user) };
}

export async function resolveStaffAutoLoginServer({ request }) {
  const trustedDevice = request ? readStaffDeviceFromRequest(request) : null;
  if (!trustedDevice?.email) return { error: 'no_device' };
  if (!isDevicePinFresh(trustedDevice)) return { error: 'pin_required' };

  const supabaseGdl = getSupabaseAdmin(CLINIC_OXYGENDGL);
  const supabaseShenandoah = getSupabaseAdmin(CLINIC_SHENANDOAH);

  const result = await resolveStaffUserByEmail({
    email: trustedDevice.email,
    supabaseGdl,
    supabaseShenandoah,
  });

  if (result.error) return result;
  return { user: sanitizeUser(result.user), device: trustedDevice };
}

export { ALL_CLINICS };
