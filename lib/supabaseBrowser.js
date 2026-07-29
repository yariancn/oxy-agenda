import { createClient } from '@supabase/supabase-js';
import { isShenandoah, normalizeClinicId } from './clinicRegistry.js';

function publicUrl(clinicName) {
  if (isShenandoah(clinicName)) {
    return String(process.env.NEXT_PUBLIC_SUPABASE_TX_URL || '').trim();
  }
  return String(process.env.NEXT_PUBLIC_SUPABASE_GDL_URL || '').trim();
}

function publicAnonKey(clinicName) {
  if (isShenandoah(clinicName)) {
    return String(process.env.NEXT_PUBLIC_SUPABASE_TX_ANON_KEY || '').trim();
  }
  return String(process.env.NEXT_PUBLIC_SUPABASE_GDL_ANON_KEY || '').trim();
}

/** Browser Supabase client (anon) for Realtime only — never use service role here. */
export function createClinicBrowserClient(clinicName) {
  const url = publicUrl(clinicName);
  const key = publicAnonKey(clinicName);
  if (!url || !key) return null;
  normalizeClinicId(clinicName);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 2 } },
  });
}
