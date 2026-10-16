'use client';

import { useEffect, useState } from 'react';

/**
 * One-tap YES: confirm on open via POST (JS). Link-preview bots usually do not run this,
 * so they cannot auto-confirm. Real patients see "confirmada" with no extra button.
 */
export default function AutoConfirmSi({ code, summary = '' }) {
  const [state, setState] = useState('working'); // working | ok | already | error
  const [message, setMessage] = useState('Confirmando tu cita…');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/public/confirm-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ code, reply: 'si' }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.ok) {
          setState(data.already ? 'already' : 'ok');
          setMessage(data.already
            ? 'Ya estaba confirmada. Te esperamos.'
            : '¡Listo! Cita confirmada. Te esperamos.');
          return;
        }
        setState('error');
        setMessage(
          data?.error === 'cancelled'
            ? 'Esta cita ya fue cancelada. Llama al 33 2166 4083.'
            : (data?.error || 'No se pudo confirmar. Llama al 33 2166 4083.'),
        );
      } catch {
        if (!cancelled) {
          setState('error');
          setMessage('No se pudo confirmar. Llama al 33 2166 4083.');
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [code]);

  const tone = state === 'error' ? 'warn' : 'ok';
  const bg = tone === 'ok' ? '#ecfdf5' : '#fff7ed';
  const border = tone === 'ok' ? '#6ee7b7' : '#fdba74';
  const color = tone === 'ok' ? '#065f46' : '#9a3412';

  return (
    <main style={{
      margin: 0,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: bg,
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    }}
    >
      <div style={{
        maxWidth: 420,
        width: '100%',
        background: '#fff',
        border: `2px solid ${border}`,
        borderRadius: 20,
        padding: '28px 24px',
        boxShadow: '0 10px 30px rgba(0,0,0,.06)',
        textAlign: 'center',
        color,
      }}
      >
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.8 }}>
          OXYGENGDL
        </p>
        <h1 style={{ margin: '0 0 10px', fontSize: '1.35rem', lineHeight: 1.25 }}>
          {state === 'working' ? 'Confirmando…' : state === 'error' ? 'No se pudo confirmar' : '¡Cita confirmada!'}
        </h1>
        <p style={{ margin: '0 0 8px', fontSize: '0.95rem', lineHeight: 1.45 }}>{message}</p>
        {summary ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{summary}</p>
        ) : null}
        {state !== 'working' && state !== 'error' ? (
          <p style={{ margin: '16px 0 0', fontSize: 12, opacity: 0.75 }}>
            Dudas: 33 2166 4083
          </p>
        ) : null}
      </div>
    </main>
  );
}
