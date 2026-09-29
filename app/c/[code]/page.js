import Link from 'next/link';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from '../../../lib/clinicRegistry.js';
import { CONFIRMATION_STATUS } from '../../../lib/appointmentConfirmation.js';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Confirmar cita · OXYGENGDL',
  robots: { index: false, follow: false },
};

/**
 * Short link without reply: /c/{code}
 * Shows two big SI / NO buttons (fallback if SMS client strips path).
 */
export default async function ShortConfirmChoicePage({ params }) {
  const p = typeof params?.then === 'function' ? await params : (params || {});
  const code = String(p.code || '').trim();
  if (!code) {
    return (
      <Result
        heading="Enlace incompleto"
        body="Abre el enlace de confirmación que te enviamos por SMS."
        tone="warn"
      />
    );
  }

  let summary = '';
  let alreadyStatus = null;
  try {
    for (const clinic of [CLINIC_OXYGENDGL, CLINIC_SHENANDOAH]) {
      try {
        const supabase = getSupabaseAdmin(clinic);
        const { data: appt } = await supabase
          .from('appointments')
          .select('patient, full_date, time, confirmation_status')
          .eq('confirmation_code', code)
          .maybeSingle();
        if (!appt) continue;
        const status = appt.confirmation_status || CONFIRMATION_STATUS.NONE;
        if (status === CONFIRMATION_STATUS.CONFIRMED || status === CONFIRMATION_STATUS.DECLINED) {
          alreadyStatus = status;
        }
        summary = `${appt.full_date || ''} · ${appt.time || ''}`.trim();
        break;
      } catch {
        /* try next clinic */
      }
    }
  } catch {
    /* show buttons anyway */
  }

  if (alreadyStatus === CONFIRMATION_STATUS.CONFIRMED) {
    return (
      <Result
        heading="Ya estaba confirmada"
        body="Te esperamos. Si necesitas cambiar el horario, llama al 33 2166 4083."
        tone="ok"
      />
    );
  }
  if (alreadyStatus === CONFIRMATION_STATUS.DECLINED) {
    return (
      <Result
        heading="Ya habías indicado que no asistes"
        body="La clínica revisará tu horario. Gracias por avisar."
        tone="warn"
      />
    );
  }

  const enc = encodeURIComponent(code);
  return (
    <main style={shellStyle('#eff6ff')}>
      <div style={cardStyle('#93c5fd', '#1e3a8a')}>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.8 }}>
          OXYGENGDL
        </p>
        <h1 style={{ margin: '0 0 8px', fontSize: '1.4rem', lineHeight: 1.25 }}>
          ¿Confirmas tu sesión?
        </h1>
        {summary ? (
          <p style={{ margin: '0 0 20px', fontSize: '0.95rem', opacity: 0.9 }}>{summary}</p>
        ) : (
          <p style={{ margin: '0 0 20px', fontSize: '0.95rem', opacity: 0.9 }}>Da click en SI o NO.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link href={`/c/${enc}/si`} style={btnStyle('#059669', '#fff')}>
            SI, voy a asistir
          </Link>
          <Link href={`/c/${enc}/no`} style={btnStyle('#dc2626', '#fff')}>
            NO, no podré ir
          </Link>
        </div>
        <p style={{ margin: '18px 0 0', fontSize: 12, opacity: 0.75 }}>
          Dudas: 33 2166 4083
        </p>
      </div>
    </main>
  );
}

function shellStyle(bg) {
  return {
    margin: 0,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: bg,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  };
}

function cardStyle(border, color) {
  return {
    maxWidth: 420,
    width: '100%',
    background: '#fff',
    border: `2px solid ${border}`,
    borderRadius: 20,
    padding: '28px 24px',
    boxShadow: '0 10px 30px rgba(0,0,0,.06)',
    textAlign: 'center',
    color,
  };
}

function btnStyle(bg, color) {
  return {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '16px 18px',
    borderRadius: 14,
    background: bg,
    color,
    fontWeight: 800,
    fontSize: '1.05rem',
    textDecoration: 'none',
    textAlign: 'center',
  };
}

function Result({ heading, body, tone }) {
  const bg = tone === 'ok' ? '#ecfdf5' : tone === 'warn' ? '#fff7ed' : '#fef2f2';
  const border = tone === 'ok' ? '#6ee7b7' : tone === 'warn' ? '#fdba74' : '#fecaca';
  const color = tone === 'ok' ? '#065f46' : tone === 'warn' ? '#9a3412' : '#991b1b';
  return (
    <main style={shellStyle(bg)}>
      <div style={cardStyle(border, color)}>
        <h1 style={{ margin: '0 0 12px', fontSize: '1.35rem', lineHeight: 1.25 }}>{heading}</h1>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5 }}>{body}</p>
      </div>
    </main>
  );
}
