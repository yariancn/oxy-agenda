import { createClient } from '@supabase/supabase-js';

// BÓVEDA 1: GUADALAJARA, MEX (Tu proyecto original que ya tiene datos)
const urlGdl = 'https://yspysvrktdbyvduewlro.supabase.co';
const keyGdl = 'sb_publishable_tr0Z_bhGdr_iGFbtE6uw7Q_iOIQe_eI';
export const supabaseGdl = createClient(urlGdl, keyGdl);

// BÓVEDA 2: SHENANDOAH, TX (Tu proyecto nuevo que está vacío)
const urlShenandoah = 'https://dbvaoyunpumxokjfwukc.supabase.co'; 
const keyShenandoah = 'sb_publishable_MQ7xMzkKfcB4pLip5wQ1lA_EzuaSSE8'; 
export const supabaseShenandoah = createClient(urlShenandoah, keyShenandoah);