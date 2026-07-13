import {
  canAccessClinic,
  getAllowedClinics,
  getStaffProfileForClinic,
  resolveStaffRoleLevel,
} from '../clinicAccess.js';
import { normalizeClinicId } from '../clinicRegistry.js';
import { ROLE_LEVEL } from './constants.js';

/**
 * Contexto de sesión que el agente usa para TODAS las decisiones.
 * Nunca confía en lo que el usuario afirma en el mensaje.
 */
export function buildAgentContext({
  user,
  dbRoles = [],
  activeClinic = null,
  message = '',
} = {}) {
  if (!user) {
    return {
      authenticated: false,
      user: null,
      roleLevel: ROLE_LEVEL.GUEST,
      activeClinic: null,
      allowedClinics: [],
      staffName: '',
      staffRole: '',
      isMaster: false,
      isManager: false,
      message: String(message || '').trim(),
    };
  }

  const clinic = normalizeClinicId(activeClinic) || user.homeClinic || getAllowedClinics(user, { dbRoles })[0];
  const roleLevel = resolveStaffRoleLevel(user, dbRoles, clinic);
  const allowedClinics = getAllowedClinics(user, { roleLevel, dbRoles, activeClinic: clinic });
  const profile = getStaffProfileForClinic(user, clinic) || user;

  return {
    authenticated: true,
    user,
    roleLevel,
    activeClinic: clinic,
    allowedClinics,
    staffName: String(profile?.name || user?.name || '').trim(),
    staffRole: String(profile?.role || user?.role || '').trim(),
    isMaster: roleLevel <= ROLE_LEVEL.MASTER,
    isManager: roleLevel <= ROLE_LEVEL.MANAGER,
    message: String(message || '').trim(),
  };
}

export function assertAgentClinicAccess(ctx, clinic) {
  const id = normalizeClinicId(clinic);
  if (!ctx?.authenticated) return { ok: false, reason: 'unauthorized' };
  if (!canAccessClinic(ctx.user, id, { roleLevel: ctx.roleLevel })) {
    return { ok: false, reason: 'clinic_denied', clinic: id };
  }
  return { ok: true, clinic: id };
}
