#!/usr/bin/env node
/**
 * Checklist de variables para UN solo proyecto Vercel (oxy-agenda-gdl / oxy-agenda.vercel.app).
 * Ejecutar: node scripts/vercel-unify-env.mjs
 *
 * Pasos manuales en Vercel:
 * 1. Copiar TODAS las variables de oxy-agenda-houston → oxy-agenda-gdl (si falta alguna).
 * 2. Agregar Twilio (USA SMS) y WhatsApp (México, cuando Meta esté listo).
 * 3. Redeploy oxy-agenda-gdl.
 * 4. Verificar https://oxy-agenda.vercel.app y https://oxy-agenda-houston.vercel.app (redirect).
 * 5. Desconectar Git de oxy-agenda-houston → Settings → Delete project (opcional, cuando redirect OK).
 */

const REQUIRED = [
  { key: 'NEXT_PUBLIC_SUPABASE_GDL_URL', clinic: 'GDL DB' },
  { key: 'NEXT_PUBLIC_SUPABASE_GDL_ANON_KEY', clinic: 'GDL DB' },
  { key: 'NEXT_PUBLIC_SUPABASE_TX_URL', clinic: 'TX DB' },
  { key: 'NEXT_PUBLIC_SUPABASE_TX_ANON_KEY', clinic: 'TX DB' },
  { key: 'RESEND_API_KEY', clinic: 'email both' },
  { key: 'RESEND_FROM_GDL', clinic: 'email GDL' },
  { key: 'RESEND_FROM_TX', clinic: 'email TX' },
];

const USA_SMS = [
  { key: 'TWILIO_ACCOUNT_SID', clinic: 'SMS Shenandoah' },
  { key: 'TWILIO_AUTH_TOKEN', clinic: 'SMS Shenandoah' },
  { key: 'TWILIO_PHONE_NUMBER', clinic: 'SMS Shenandoah (+1)' },
  { key: 'TWILIO_MESSAGING_SERVICE_SID', clinic: 'A2P Messaging Service (MG...)' },
];

const WHATSAPP_MX = [
  { key: 'WHATSAPP_ACCESS_TOKEN', clinic: 'WhatsApp GDL (cuando Meta listo)' },
  { key: 'WHATSAPP_PHONE_NUMBER_ID', clinic: 'WhatsApp GDL' },
  { key: 'WHATSAPP_TEMPLATE_BOOKING', clinic: 'WhatsApp GDL' },
];

function checkGroup(title, vars) {
  console.log(`\n=== ${title} ===`);
  for (const { key, clinic } of vars) {
    const ok = Boolean(process.env[key]);
    console.log(`${ok ? '✓' : '✗'} ${key} (${clinic})`);
  }
}

console.log('Variables locales (.env.local) — en Vercel deben estar TODAS en oxy-agenda-gdl');
checkGroup('Obligatorias (ambas clínicas, bases separadas)', REQUIRED);
checkGroup('Twilio — solo SMS USA (Shenandoah)', USA_SMS);
checkGroup('WhatsApp — solo México (Guadalajara)', WHATSAPP_MX);

console.log('\n=== Separación en código (no requiere env extra) ===');
console.log('• Guadalajara → Supabase GDL + Resend GDL + WhatsApp (cuando configurado)');
console.log('• Shenandoah → Supabase TX + Resend TX + Twilio SMS');
console.log('• Staff login → PIN consulta solo la base de cada clínica');
console.log('\nDominio canónico: oxy-agenda.vercel.app');
console.log('Redirect automático: oxy-agenda-houston.vercel.app → canónico');
