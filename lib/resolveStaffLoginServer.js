import { normalizeStaffSessionUser } from './clinicAccess.js';
import { CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from './clinicRegistry.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import {
  canAutoLoginWithoutPin,
  readStaffDeviceFromRequest,
} from './staffDeviceTrust.js';
import {
  assertLoginNotLocked,
  clearLoginAttempts,
  lockoutMinutesRemaining,
  recordLoginFailure,
} from './staffLoginRateLimit.js';
import { resolveStaffLoginWithCredentials, resolveStaffUserByEmail } from './staffLoginResolve.js';
import { normalizeStaffEmail } from './staffEmail.js';
import { getRequestClientIp } from './requestClientIp.js';

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
  const supremePin = String(process.env.STAFF_SUPREME_PIN || '').trim();
  if (!supremePin) return false;
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

  return { user: normalizeStaffSessionUser(sanitizeUser(result.user), { roleLevel: result.user?.accessLevel }) };
}

export async function refreshStaffSessionUser(user) {
  if (!user || user.id === 'admin') return user;
  const email = normalizeStaffEmail(user.email);
  if (!email) return user;

  const supabaseGdl = getSupabaseAdmin(CLINIC_OXYGENDGL);
  const supabaseShenandoah = getSupabaseAdmin(CLINIC_SHENANDOAH);
  const result = await resolveStaffUserByEmail({
    email,
    supabaseGdl,
    supabaseShenandoah,
  });

  // Deactivated / removed / invalid → drop session (do not keep stale privileges).
  if (result.error === 'invalid' || (!result.user && result.error)) {
    return null;
  }
  // Transient / unexpected: keep current session rather than mass-logout.
  if (result.error || !result.user) return user;

  const refreshed = sanitizeUser(result.user);
  // Prefer DB truth — do not union old clinics or keep a better (lower) accessLevel.
  return normalizeStaffSessionUser({
    ...refreshed,
    email: refreshed.email || user.email,
  }, { roleLevel: refreshed.accessLevel });
}

export async function resolveStaffAutoLoginServer({ request }) {
  const trustedDevice = request ? readStaffDeviceFromRequest(request) : null;
  if (!trustedDevice?.email) return { error: 'no_device' };

  const clientIp = getRequestClientIp(request);
  if (!canAutoLoginWithoutPin(trustedDevice, clientIp)) {
    return { error: 'pin_required' };
  }

  const supabaseGdl = getSupabaseAdmin(CLINIC_OXYGENDGL);
  const supabaseShenandoah = getSupabaseAdmin(CLINIC_SHENANDOAH);

  const result = await resolveStaffUserByEmail({
    email: trustedDevice.email,
    supabaseGdl,
    supabaseShenandoah,
  });

  if (result.error) return result;
  const user = normalizeStaffSessionUser(sanitizeUser(result.user), { roleLevel: result.user?.accessLevel });
  return { user, device: trustedDevice, clientIp };
}
