'use client';

import { useCallback, useEffect, useState } from 'react';

const DEFAULT_APP_ID = '1654079171536415';

/** NEXT_PUBLIC_* must be numeric IDs in Vercel — not the variable name. */
function resolveMetaId(raw, fallback, label) {
  const value = String(raw || '').trim();
  if (/^\d{10,20}$/.test(value)) return { value, warning: null };
  if (value) {
    return {
      value: fallback,
      warning: `${label} inválido en Vercel ("${value.slice(0, 40)}"). Usando ${fallback}. Corrige y redeploy.`,
    };
  }
  return { value: fallback, warning: null };
}

function loadFacebookSdk() {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }
    const existing = document.getElementById('facebook-jssdk');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    window.fbAsyncInit = () => resolve();
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.src = 'https://connect.facebook.net/es_ES/sdk.js';
    script.onerror = () => reject(new Error('No se pudo cargar Facebook SDK'));
    document.body.appendChild(script);
  });
}

export default function WhatsAppCoexistenceSetup() {
  const appResolved = resolveMetaId(
    process.env.NEXT_PUBLIC_META_APP_ID,
    DEFAULT_APP_ID,
    'NEXT_PUBLIC_META_APP_ID',
  );
  const configResolved = resolveMetaId(
    process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_CONFIG_ID,
    '',
    'NEXT_PUBLIC_WHATSAPP_EMBEDDED_CONFIG_ID',
  );
  const appId = appResolved.value;
  const configId = configResolved.value;
  const apiVersion = process.env.NEXT_PUBLIC_META_GRAPH_VERSION?.trim() || 'v21.0';

  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const envWarnings = [appResolved.warning, configResolved.warning].filter(Boolean);

  const appendLog = useCallback((message) => {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString('es-MX')} — ${message}`]);
  }, []);

  useEffect(() => {
    if (!configId) {
      appendLog('Configura NEXT_PUBLIC_WHATSAPP_EMBEDDED_CONFIG_ID (Configuration ID de Meta).');
      return undefined;
    }

    let cancelled = false;

    loadFacebookSdk()
      .then(() => {
        if (cancelled) return;
        window.FB.init({
          appId,
          cookie: true,
          xfbml: true,
          version: apiVersion,
        });
        setSdkReady(true);
        appendLog(`SDK listo · App ${appId}`);
      })
      .catch((err) => {
        appendLog(err.message || 'Error cargando SDK');
      });

    return () => {
      cancelled = true;
    };
  }, [appendLog, appId, apiVersion, configId]);

  useEffect(() => {
    const onMessage = (event) => {
      if (!event.origin?.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        appendLog(`Meta evento: ${data.event || 'unknown'}`);
        if (data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
          const wabaId = data.data?.waba_id || data.data?.wabaId;
          const phoneId = data.data?.phone_number_id || data.data?.phoneNumberId;
          appendLog(`Coexistencia completada · WABA ${wabaId || '?'} · Phone ID ${phoneId || '?'}`);
          appendLog('Prueba envío con: node scripts/whatsapp-coexistence-probe.mjs');
        }
        if (data.event === 'CANCEL') {
          appendLog('Flujo cancelado en Meta.');
        }
        if (data.event === 'ERROR') {
          appendLog(`Error Meta: ${JSON.stringify(data.data || data).slice(0, 240)}`);
        }
      } catch {
        // non-JSON postMessage — ignore
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [appendLog]);

  const launchCoexistence = () => {
    if (!sdkReady || !window.FB) {
      appendLog('SDK no listo.');
      return;
    }
    if (!configId) {
      appendLog('Falta Configuration ID.');
      return;
    }

    setBusy(true);
    appendLog('Abriendo Embedded Signup (coexistencia)…');
    appendLog('Si no aparece ventana de Meta: Safari → permite ventanas emergentes para oxy-agenda.vercel.app');

    const timeout = window.setTimeout(() => {
      setBusy(false);
      appendLog('Tiempo agotado. ¿Popup bloqueado? Prueba Chrome o permite popups.');
    }, 45000);

    window.FB.login(
      (response) => {
        window.clearTimeout(timeout);
        setBusy(false);
        if (response.authResponse?.code) {
          appendLog('Código OAuth recibido (intercambio opcional en servidor).');
        } else if (response.status === 'not_authorized') {
          appendLog('No autorizado — revisa permisos de la app en Meta.');
        } else {
          appendLog(`Login status: ${response.status || 'unknown'}`);
          if (!response.status || response.status === 'unknown') {
            appendLog('Sin respuesta de Meta — revisa App ID, Configuration ID y dominios OAuth en developers.');
          }
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Oxygengdl · WhatsApp API</p>
        <h1 className="text-2xl font-black text-slate-900 uppercase">Coexistencia WhatsApp</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Conecta el +52 de recepción (app WhatsApp Business) con Cloud API para confirmaciones automáticas.
          Usa la app <strong>Oxygengdl mensajes</strong> ({appId}), no Predictacore Ads.
        </p>
      </header>

      <ol className="text-xs text-slate-600 space-y-2 list-decimal pl-5">
        <li>Ten WhatsApp Business actualizado en el celular del +52 33 2166 4083.</li>
        <li>Admin de portfolio oxygengdl en esta sesión de Facebook.</li>
        <li>Elige conectar cuenta existente y sigue QR/código en el teléfono.</li>
      </ol>

      {envWarnings.length > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-xs text-red-900 space-y-2">
          <p className="font-black uppercase">Variables mal configuradas en Vercel</p>
          {envWarnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <p>
            En Vercel pon el <strong>número</strong>, no el nombre de la variable. Ejemplo:{' '}
            <code className="bg-white px-1 rounded">1654079171536415</code> y tu Configuration ID de Meta.
          </p>
        </div>
      )}

      {!configId && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-black uppercase mb-2">Falta Configuration ID</p>
          <p>
            developers.facebook.com → App <strong>Oxygengdl mensajes</strong> → Facebook Login for Business →
            Configurations → crear variante <strong>WhatsApp Embedded Signup</strong> con coexistencia → copiar ID a{' '}
            <code className="bg-white px-1 rounded">NEXT_PUBLIC_WHATSAPP_EMBEDDED_CONFIG_ID</code> en Vercel y redeploy.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={launchCoexistence}
        disabled={!configId || !sdkReady || busy}
        className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl uppercase disabled:opacity-50"
      >
        {busy ? 'Abriendo Meta…' : 'Iniciar coexistencia en Meta'}
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[11px] text-slate-600 space-y-1">
        <p><strong>App ID activo:</strong> {appId}</p>
        <p><strong>Configuration ID:</strong> {configId || '(falta)'}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Registro</p>
        <ul className="space-y-1 max-h-48 overflow-y-auto text-[11px] font-mono text-slate-700">
          {log.length === 0 && <li className="text-slate-400">Sin eventos aún.</li>}
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
