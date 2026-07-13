import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { filterRowsByClinic, normalizeClinicId } from '../clinicRegistry.js';
import { assertAgentClinicAccess } from './context.js';
import { normalizePatientRow, normalizeAppointmentRow, todayForClinic } from './parseParams.js';
import { defaultEquipmentForClinic } from '../screenshotEquipment.js';

export function createAgentServices(clinic) {
  const clinicId = normalizeClinicId(clinic);
  const supabase = getSupabaseAdmin(clinicId);

  return {
    clinic: clinicId,
    supabase,

    async fetchDbRoles() {
      const { data, error } = await supabase.from('user_roles').select('*');
      if (error) throw new Error(error.message);
      return data || [];
    },

    async listPatients({ search = '', limit = 8 } = {}) {
      const { data, error } = await supabase.from('patients').select('*').limit(200);
      if (error) throw new Error(error.message);
      const rows = filterRowsByClinic(data || [], clinicId);
      const q = String(search || '').trim().toLowerCase();
      if (!q) return rows.slice(0, limit).map(normalizePatientRow);
      const digits = q.replace(/\D/g, '');
      const filtered = rows.filter((p) => {
        const name = String(p.Name || p.name || '').toLowerCase();
        const phone = String(p.Phone || p.phone || '').replace(/\D/g, '');
        return name.includes(q) || (digits.length >= 4 && phone.includes(digits));
      });
      return filtered.slice(0, limit).map(normalizePatientRow);
    },

    async listAppointments({ fullDate, patient = '', limit = 30 } = {}) {
      let query = supabase.from('appointments').select('*');
      if (fullDate) query = query.eq('full_date', fullDate);
      const { data, error } = await query.order('time', { ascending: true }).limit(150);
      if (error) throw new Error(error.message);
      let rows = filterRowsByClinic(data || [], clinicId)
        .filter((a) => a.check_in_status !== 'Cancelado')
        .map(normalizeAppointmentRow);
      const p = String(patient || '').trim().toLowerCase();
      if (p) rows = rows.filter((a) => String(a.patient || '').toLowerCase().includes(p));
      return rows.slice(0, limit);
    },

    async getAppointmentById(id) {
      const { data, error } = await supabase.from('appointments').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return normalizeAppointmentRow(data);
    },

    async listServices() {
      const { data, error } = await supabase.from('services').select('*').eq('is_active', true);
      if (error) throw new Error(error.message);
      return filterRowsByClinic(data || [], clinicId);
    },

    async listSalesSummary({ startDate, endDate } = {}) {
      const { data, error } = await supabase.from('patients').select('*').limit(500);
      if (error) throw new Error(error.message);
      const patients = filterRowsByClinic(data || [], clinicId);
      let revenue = 0;
      let txCount = 0;
      for (const p of patients) {
        for (const tx of p.packageHistory || []) {
          const d = String(tx.date || tx.full_date || '').slice(0, 10);
          if (startDate && d && d < startDate) continue;
          if (endDate && d && d > endDate) continue;
          const price = Number(tx.price) || 0;
          if (price > 0) {
            revenue += price;
            txCount += 1;
          }
        }
      }
      const apps = await this.listAppointments({ limit: 500 });
      const finalized = apps.filter((a) => {
        if (a.check_in_status !== 'Finalizado') return false;
        if (startDate && a.full_date < startDate) return false;
        if (endDate && a.full_date > endDate) return false;
        return true;
      });
      const returned = apps.filter((a) => {
        if (a.check_in_status !== 'Devuelto') return false;
        if (startDate && a.full_date < startDate) return false;
        if (endDate && a.full_date > endDate) return false;
        return true;
      });
      return { revenue, txCount, finalized: finalized.length, returned: returned.length };
    },

    async listAuditLogs({ limit = 20 } = {}) {
      const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return filterRowsByClinic(data || [], clinicId);
    },

    clinicToday() {
      return todayForClinic(clinicId);
    },

    defaultEquipment(services) {
      return defaultEquipmentForClinic(clinicId, services);
    },
  };
}

export function requireClinic(ctx, services) {
  const gate = assertAgentClinicAccess(ctx, services.clinic);
  if (!gate.ok) throw new Error(gate.reason === 'clinic_denied' ? 'Sin acceso a esta clínica.' : 'No autorizado.');
}
