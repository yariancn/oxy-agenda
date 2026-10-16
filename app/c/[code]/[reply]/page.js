import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from '../../../../lib/clinicRegistry.js';
import { CONFIRMATION_STATUS } from '../../../../lib/appointmentConfirmation.js';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Confirmar cita · OXYGENGDL',
  robots: { index: false, follow: false },
};

/**
 * Short SMS links: /c/{code}/si  or  /c/{code}/no
 *
 * IMPORTANT: GET never applies the reply (WhatsApp/iMessage/SMS link previews
 * were auto-opening /no and marking declined). Patient must tap Confirm (POST).
 */
export default async function ShortConfirmReplyPage({ params, searchParams }) {
  const p = typeof params?.then === 'function' ? await params : (params || {});
  const sp = typeof searchParams?.then === 'function' ? await searchParams : (searchParams || {});
  const code = String(p.code || '').trim();
  const replyRaw = String(p.reply || '').trim().toLowerCase();
  const done = String(sp.done || '') === '1';
  const already = String(sp.already || '') === '1';
  const isNo = replyRaw === 'no' || replyRaw === '0' || replyRaw === 'declined';
  const isYes = replyRaw === 'si' || replyRaw === 'yes' || replyRaw === '1' || replyRaw === 'confirmed';

  if (!code || (!isNo && !isYes)) {
    return (
      <Result
        heading="Enlace incompleto"
        body="Abre el enlace SI o NO que te enviamos por SMS."
        tone="warn"
      />
    );
  }

  // After successful POST redirect
  if (done) {
    if (isYes) {
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

  // Read-only status check (safe for previews)
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
        /* try next */
      }
    }
  } catch {
    /* show confirm button anyway */
  }

  if (alreadyStatus === CONFIRMATION_STATUS.CONFIRMED && isYes) {
    return (
      <Result
        heading="Ya estaba confirmada"
        body="Te esperamos. Si necesitas cambiar el horario, llama al 33 2166 4083."
        tone="ok"
      />
    );
  }
  if (alreadyStatus === CONFIRMATION_STATUS.DECLINED && isNo) {
    return (
      <Result
        heading="Ya habías indicado que no asistes"
        body="La clínica revisará tu horario. Gracias por avisar."
        tone="warn"
      />
    );
  }
  // Wrongly auto-declined by preview: allow SI to override via POST
  if (alreadyStatus === CONFIRMATION_STATUS.DECLINED && isYes) {
    return (
      <ConfirmGate
        code={code}
        reply="si"
        heading="¿Confirmas que SÍ asistes?"
        body={summary
          ? `Antes se registró un NO por error. ${summary}`
          : 'Antes se registró un NO (a veces por vista previa del SMS). Confirma si sí vendrás.'}
        buttonLabel="Sí, voy a asistir"
        tone="ok"
      />
    );
  }
  if (alreadyStatus === CONFIRMATION_STATUS.CONFIRMED && isNo) {
    return (
      <ConfirmGate
        code={code}
        reply="no"
        heading="¿Confirmas que NO podrás ir?"
        body={summary
          ? `Antes se confirmó asistencia. ${summary}`
          : 'Antes se confirmó asistencia. Confirma si quieres cancelar.'}
        buttonLabel="No, no podré ir"
        tone="warn"
      />
    );
  }

  return (
    <ConfirmGate
      code={code}
      reply={isNo ? 'no' : 'si'}
      heading={isNo ? '¿Confirmas que NO podrás ir?' : '¿Confirmas que SÍ asistes?'}
      body={summary || 'Un toque para registrar tu respuesta.'}
      buttonLabel={isNo ? 'No, no podré ir' : 'Sí, voy a asistir'}
      tone={isNo ? 'warn' : 'ok'}
    />
  );
}

function ConfirmGate({ code, reply, heading, body, buttonLabel, tone }) {
  const bg = tone === 'ok' ? '#ecfdf5' : '#fff7ed';
  const border = tone === 'ok' ? '#6ee7b7' : '#fdba74';
  const color = tone === 'ok' ? '#065f46' : '#9a3412';
  const btnBg = tone === 'ok' ? '#059669' : '#dc2626';
  return (
    <main style={shell(bg)}>
      <div style={card(border, color)}>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.8 }}>
          OXYGENGDL
        </p>
        <h1 style={{ margin: '0 0 10px', fontSize: '1.35rem', lineHeight: 1.25 }}>{heading}</h1>
        <p style={{ margin: '0 0 20px', fontSize: '0.95rem', lineHeight: 1.45 }}>{body}</p>
        <form method="POST" action="/api/public/confirm-reply">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="reply" value={reply} />
          <button
            type="submit"
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              padding: '16px 18px',
              borderRadius: 14,
              border: 'none',
              background: btnBg,
              color: '#fff',
              fontWeight: 800,
              fontSize: '1.05rem',
              cursor: 'pointer',
            }}
          >
            {buttonLabel}
          </button>
        </form>
        <p style={{ margin: '16px 0 0', fontSize: 12, opacity: 0.75 }}>
          Si no querías esta opción, cierra esta pantalla. Dudas: 33 2166 4083
        </p>
      </div>
    </main>
  );
}

function Result({ heading, body, tone }) {
  const bg = tone === 'ok' ? '#ecfdf5' : tone === 'warn' ? '#fff7ed' : '#fef2f2';
  const border = tone === 'ok' ? '#6ee7b7' : tone === 'warn' ? '#fdba74' : '#fecaca';
  const color = tone === 'ok' ? '#065f46' : tone === 'warn' ? '#9a3412' : '#991b1b';
  return (
    <main style={shell(bg)}>
      <div style={card(border, color)}>
        <h1 style={{ margin: '0 0 12px', fontSize: '1.35rem', lineHeight: 1.25 }}>{heading}</h1>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5 }}>{body}</p>
      </div>
    </main>
  );
}

function shell(bg) {
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

function card(border, color) {
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
