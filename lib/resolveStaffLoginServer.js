import { ALL_CLINICS } from './clinicAccess.js';
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

  const supabaseGdl = getSupabaseAdmin('Guadalajara');
  const supabaseShenandoah = getSupabaseAdmin('Shenandoah');

  const [gdlConfigRes, txConfigRes, gdlStaffRes, txStaffRes] = await Promise.all([
    supabaseGdl.from('company_config').select('master_pin').eq('clinic', 'Guadalajara').maybeSingle(),
    supabaseShenandoah.from('company_config').select('master_pin').eq('clinic', 'Shenandoah').maybeSingle(),
    supabaseGdl.from('users_staff').select('*').eq('pin', normalizedPin).eq('is_active', true),
    supabaseShenandoah.from('users_staff').select('*').eq('pin', normalizedPin).eq('is_active', true),
  ]);

  const gdlMaster = String(gdlConfigRes.data?.master_pin || '000000');
  const txMaster = String(txConfigRes.data?.master_pin || '000000');

  if (normalizedPin === gdlMaster || normalizedPin === txMaster) {
    return {
      user: sanitizeUser({
        id: 'admin',
        name: 'Administrador Maestro',
        role: 'Super Administrador Maestro',
        allowedClinics: ALL_CLINICS,
      }),
    };
  }

  const clinicProfiles = {};
  const allowedClinics = [];

  const gdlStaff = (gdlStaffRes.data || []).find((u) => String(u.pin) === normalizedPin && u.is_active);
  const txStaff = (txStaffRes.data || []).find((u) => String(u.pin) === normalizedPin && u.is_active);

  if (gdlStaff) {
    allowedClinics.push('Guadalajara');
    clinicProfiles.Guadalajara = gdlStaff;
  }
  if (txStaff) {
    allowedClinics.push('Shenandoah');
    clinicProfiles.Shenandoah = txStaff;
  }

  if (allowedClinics.length === 0) return { error: 'invalid' };

  const primaryClinic = allowedClinics[0];
  const primary = clinicProfiles[primaryClinic];

  return {
    user: sanitizeUser({
      ...primary,
      allowedClinics,
      clinicProfiles,
      homeClinic: primaryClinic,
    }),
  };
}
