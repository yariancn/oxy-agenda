import { createClient } from '@supabase/supabase-js';
import { isShenandoah, normalizeClinicId } from './clinicRegistry.js';

function clinicUrl(clinicName) {
  if (isShenandoah(clinicName)) {
    return String(process.env.SUPABASE_TX_URL || process.env.NEXT_PUBLIC_SUPABASE_TX_URL || '').trim();
  }
  return String(process.env.SUPABASE_GDL_URL || process.env.NEXT_PUBLIC_SUPABASE_GDL_URL || '').trim();
}

function clinicServiceKey(clinicName) {
  if (isShenandoah(clinicName)) {
    return String(process.env.SUPABASE_TX_SERVICE_ROLE_KEY || '').trim();
  }
  return String(process.env.SUPABASE_GDL_SERVICE_ROLE_KEY || '').trim();
}

export function getSupabaseAdmin(clinicName) {
  normalizeClinicId(clinicName);
  const url = clinicUrl(clinicName);
  const key = clinicServiceKey(clinicName);
  if (!url || !key) {
    throw new Error(`Missing Supabase admin credentials for ${clinicName}`);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getSupabaseAdminUrl(clinicName) {
  const url = clinicUrl(clinicName);
  if (!url) throw new Error(`Missing Supabase URL for ${clinicName}`);
  return url;
}
