import { createClient } from '@supabase/supabase-js';

const urlGdl = process.env.NEXT_PUBLIC_SUPABASE_GDL_URL;
const keyGdl = process.env.NEXT_PUBLIC_SUPABASE_GDL_ANON_KEY;
const urlShenandoah = process.env.NEXT_PUBLIC_SUPABASE_TX_URL;
const keyShenandoah = process.env.NEXT_PUBLIC_SUPABASE_TX_ANON_KEY;

if (!urlGdl || !keyGdl) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_GDL_URL o NEXT_PUBLIC_SUPABASE_GDL_ANON_KEY');
}
if (!urlShenandoah || !keyShenandoah) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_TX_URL o NEXT_PUBLIC_SUPABASE_TX_ANON_KEY');
}

export const supabaseGdl = createClient(urlGdl, keyGdl);
export const supabaseShenandoah = createClient(urlShenandoah, keyShenandoah);
