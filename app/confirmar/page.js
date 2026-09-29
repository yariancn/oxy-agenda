import Link from 'next/link';
import { applyConfirmationReplyFromToken } from '../../lib/processConfirmationInbound.js';
import { verifyAppointmentManageToken } from '../../lib/appointmentManageToken.js';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin.js';
import { CONFIRMATION_STATUS } from '../../lib/appointmentConfirmation.js';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Confirmar cita · OXYGENGDL',
  robots: { index: false, follow: false },
};

/**
 * One-tap from SMS when ?r=si|no is present.
 * Without r: two big buttons (fallback).
 */
export default async function ConfirmarPage({ searchParams }) {
  const params = typeof searchParams?.then === 'function' ? await searchParams : (searchParams || {});
  const token = String(params.t || params.token || '').trim();
  const replyRaw = String(params.r || params.reply || '').trim();

  if (!token) {
    return (
      <Result
        heading="Enlace incompleto"
        body="Abre el enlace de confirmación que te enviamos por SMS."
        tone="warn"
      />
    );
  }

  // Choice screen — two big buttons (tap 2)
  if (!replyRaw) {
    const claims = verifyAppointmentManageToken(token);
    if (!claims?.appointmentId) {
      return (
        <Result
          heading="Enlace inválido o vencido"
          body="Pide a la clínica que te reenvíe la confirmación."
          tone="err"
        />
      );
    }

    let summary = '';
    try {
      const supabase = getSupabaseAdmin(claims.clinicName);
      const { data: appt } = await supabase
        .from('appointments')
        .select('patient, full_date, time, confirmation_status')
        .eq('id', claims.appointmentId)
        .maybeSingle();
      if (appt) {
        const status = appt.confirmation_status || CONFIRMATION_STATUS.NONE;
        if (status === CONFIRMATION_STATUS.CONFIRMED) {
          return (
            <Result
              heading="Ya estaba confirmada"
              body="Te esperamos. Si necesitas cambiar el horario, llama al 33 2166 4083."
              tone="ok"
            />
          );
        }
        if (status === CONFIRMATION_STATUS.DECLINED) {
          return (
            <Result
              heading="Ya habías indicado que no asistes"
              body="La clínica revisará tu horario. Gracias por avisar."
              tone="warn"
            />
          );
        }
        summary = `${appt.full_date || ''} · ${appt.time || ''}`.trim();
      }
    } catch {
      // still show buttons
    }

    const t = encodeURIComponent(token);
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
            <p style={{ margin: '0 0 20px', fontSize: '0.95rem', opacity: 0.9 }}>Un toque basta.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link
              href={`/c?t=${t}&r=si`}
              style={btnStyle('#059669', '#fff')}
            >
              SI, voy a asistir
            </Link>
            <Link
              href={`/c?t=${t}&r=no`}
              style={btnStyle('#dc2626', '#fff')}
            >
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

  let result;
  try {
    result = await applyConfirmationReplyFromToken({ token, replyRaw });
  } catch (err) {
    return (
      <Result
        heading="No se pudo registrar"
        body={err?.message || 'Intenta de nuevo o llama a la clínica: 33 2166 4083.'}
        tone="err"
      />
    );
  }

  if (!result?.ok && result?.error === 'invalid_token') {
    return (
      <Result
        heading="Enlace inválido o vencido"
        body="Pide a la clínica que te reenvíe la confirmación."
        tone="err"
      />
    );
  }

  if (!result?.ok && result?.error === 'not_waiting') {
    return (
      <Result
        heading="Esta cita ya no espera confirmación"
        body="Si tienes dudas, llama a OXYGENGDL: 33 2166 4083."
        tone="warn"
      />
    );
  }

  if (!result?.ok) {
    return (
      <Result
        heading="No pudimos registrar tu respuesta"
        body="Llama a la clínica: 33 2166 4083."
        tone="err"
      />
    );
  }

  const confirmed = result.reply === 'confirmed';
  const already = result.already;
  if (confirmed) {
    return (
      <Result
        heading={already ? 'Ya estaba confirmada' : '¡Listo! Cita confirmada'}
        body="Te esperamos. Si necesitas cambiar el horario, llama al 33 2166 4083."
        tone="ok"
      />
    );
  }

  return (
    <Result
      heading={already ? 'Ya habías indicado que no asistes' : 'Registramos que no podrás asistir'}
      body="La clínica revisará tu horario. Gracias por avisar."
      tone="warn"
    />
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
