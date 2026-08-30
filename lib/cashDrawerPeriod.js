import { normalizeClinicId } from './clinicRegistry.js';
import { isCashCutAuditRow } from './cashCut.js';
import {
  CASH_DRAWER_EVENT_RETIRO,
  resolveLastRetiroTimestampMs,
} from './pettyCash.js';

/** Load last retiro period + petty cash expenses for a clinic. */
export async function loadCashDrawerPeriod(activeSupabase, clinic) {
  const clinicId = normalizeClinicId(clinic);
  let drawerEvents = [];
  let auditCuts = [];
  let expenses = [];
  let tableMissing = false;

  try {
    const { data, error } = await activeSupabase
      .from('cash_drawer_events')
      .select('*')
      .eq('clinic', clinicId)
      .eq('event_type', CASH_DRAWER_EVENT_RETIRO)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      if (/cash_drawer_events|schema cache|does not exist/i.test(error.message || '')) {
        tableMissing = true;
      } else {
        throw error;
      }
    } else {
      drawerEvents = data || [];
    }
  } catch (err) {
    if (/cash_drawer_events|schema cache|does not exist/i.test(err?.message || '')) {
      tableMissing = true;
    } else {
      throw err;
    }
  }

  try {
    const { data, error } = await activeSupabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(120);
    if (!error) {
      auditCuts = (data || []).filter(isCashCutAuditRow);
    }
  } catch {
    /* optional legacy fallback */
  }

  try {
    const { data, error } = await activeSupabase
      .from('petty_cash_expenses')
      .select('*')
      .eq('clinic', clinicId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      if (/petty_cash_expenses|schema cache|does not exist/i.test(error.message || '')) {
        tableMissing = true;
      } else {
        throw error;
      }
    } else {
      expenses = data || [];
    }
  } catch (err) {
    if (/petty_cash_expenses|schema cache|does not exist/i.test(err?.message || '')) {
      tableMissing = true;
    } else {
      throw err;
    }
  }

  const sinceMs = resolveLastRetiroTimestampMs({ drawerEvents, auditCuts });
  const lastRetiro = drawerEvents[0] || auditCuts[0] || null;
  return { sinceMs, lastRetiro, expenses, tableMissing };
}
