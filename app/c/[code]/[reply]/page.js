import { applyConfirmationReplyFromToken } from '../../../../lib/processConfirmationInbound.js';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Confirmar cita · OXYGENGDL',
  robots: { index: false, follow: false },
};

/**
 * Short SMS links: /c/{code}/si  or  /c/{code}/no
 */
export default async function ShortConfirmReplyPage({ params }) {
  const p = typeof params?.then === 'function' ? await params : (params || {});
  const code = String(p.code || '').trim();
  const replyRaw = String(p.reply || '').trim();

  if (!code || !replyRaw) {
    return (
      <Result
        heading="Enlace incompleto"
        body="Abre el enlace SI o NO que te enviamos por SMS."
        tone="warn"
      />
    );
  }

  let result;
  try {
    result = await applyConfirmationReplyFromToken({ token: code, replyRaw });
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

function Result({ heading, body, tone }) {
  const bg = tone === 'ok' ? '#ecfdf5' : tone === 'warn' ? '#fff7ed' : '#fef2f2';
  const border = tone === 'ok' ? '#6ee7b7' : tone === 'warn' ? '#fdba74' : '#fecaca';
  const color = tone === 'ok' ? '#065f46' : tone === 'warn' ? '#9a3412' : '#991b1b';
  return (
    <main
      style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: bg,
        color,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: '#fff',
          border: `2px solid ${border}`,
          borderRadius: 20,
          padding: '28px 24px',
          boxShadow: '0 10px 30px rgba(0,0,0,.06)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: '0 0 12px', fontSize: '1.35rem', lineHeight: 1.25 }}>{heading}</h1>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5 }}>{body}</p>
      </div>
    </main>
  );
}
