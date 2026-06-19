export const ALL_CLINICS = ['Guadalajara', 'Shenandoah'];

const SUPREME_PIN = '1234567890';

export function normalizeStaffSessionUser(user) {
  if (!user) return null;
  if (user.id === 'admin') {
    return { ...user, allowedClinics: user.allowedClinics?.length ? user.allowedClinics : ALL_CLINICS };
  }
  if (user.allowedClinics?.length) return user;
  if (user.clinicProfiles && typeof user.clinicProfiles === 'object') {
    const allowedClinics = Object.keys(user.clinicProfiles).filter((c) => ALL_CLINICS.includes(c));
    if (allowedClinics.length) return { ...user, allowedClinics };
  }
  if (user.homeClinic && ALL_CLINICS.includes(user.homeClinic)) {
    return { ...user, allowedClinics: [user.homeClinic] };
  }
  return user;
}

export function getAllowedClinics(user) {
  const normalized = normalizeStaffSessionUser(user);
  if (!normalized) return [];
  if (normalized.id === 'admin') return ALL_CLINICS;
  return normalized.allowedClinics || [];
}

export function canAccessClinic(user, clinic) {
  return getAllowedClinics(user).includes(clinic);
}

export function getStaffProfileForClinic(user, clinic) {
  if (!user) return null;
  if (user.id === 'admin') return user;
  return user.clinicProfiles?.[clinic] || null;
}

export async function resolveStaffLogin(pin, supabaseGdl, supabaseShenandoah) {
  const normalizedPin = String(pin).trim();
  if (!normalizedPin) return { error: 'empty' };

  if (normalizedPin === SUPREME_PIN) {
    return {
      user: {
        id: 'admin',
        name: 'ADMINISTRADOR SUPREMO',
        role: 'Super Administrador Supremo',
        allowedClinics: ALL_CLINICS,
      },
    };
  }

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
      user: {
        id: 'admin',
        name: 'Administrador Maestro',
        role: 'Super Administrador Maestro',
        allowedClinics: ALL_CLINICS,
      },
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
    user: {
      ...primary,
      allowedClinics,
      clinicProfiles,
      homeClinic: primaryClinic,
    },
  };
}
