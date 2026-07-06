import { resolveStaffLogin, ALL_CLINICS } from './clinicAccess.js';
import { CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from './clinicRegistry.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

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

export async function resolveStaffLoginServer(pin) {
  const normalizedPin = String(pin || '').trim();
  if (!normalizedPin) return { error: 'empty' };

  const supremePin = String(process.env.STAFF_SUPREME_PIN || '1234567890').trim();
  if (normalizedPin === supremePin) {
    return {
      user: sanitizeUser({
        id: 'admin',
        name: 'ADMINISTRADOR SUPREMO',
        role: 'Super Administrador Supremo',
        allowedClinics: ALL_CLINICS,
      }),
    };
  }

  const supabaseGdl = getSupabaseAdmin(CLINIC_OXYGENDGL);
  const supabaseShenandoah = getSupabaseAdmin(CLINIC_SHENANDOAH);

  const result = await resolveStaffLogin(normalizedPin, supabaseGdl, supabaseShenandoah);
  if (result.error) return result;

  return { user: sanitizeUser(result.user) };
}
