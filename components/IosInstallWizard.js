'use client';

import { useMemo, useState } from 'react';
import { getIosWizardSteps } from '../lib/installContext';
import { IOS_WIZARD_UI } from '../lib/i18n';

function Arrow({ className, label, flip }) {
  return (
    <div className={`flex flex-col items-center pointer-events-none z-20 ${className}`}>
      <span
        className={`text-3xl sm:text-4xl drop-shadow-lg animate-bounce ${flip ? 'rotate-180' : ''}`}
        aria-hidden
      >
        {flip ? '👇' : '👆'}
      </span>
      {label && (
        <span className="mt-1 px-2 py-0.5 rounded-lg bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-wide shadow-lg whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
}

function PhoneChrome({ children, urlBar = 'oxy-agenda.vercel.app' }) {
  return (
    <div className="mx-auto w-full max-w-[280px] select-none">
      <div className="rounded-[2rem] border-[3px] border-slate-800 bg-slate-900 p-2 shadow-2xl">
        <div className="rounded-[1.6rem] overflow-hidden bg-white">
          <div className="h-6 bg-slate-900 flex items-center justify-center">
            <div className="w-20 h-4 rounded-full bg-black" />
          </div>
          <div className="bg-slate-100 border-b border-slate-200 px-2 py-1.5 flex items-center gap-1.5 text-[9px]">
            <span className="text-slate-500 font-bold">AA</span>
            <div className="flex-1 bg-white rounded-md px-2 py-1 text-slate-600 font-semibold truncate text-center border border-slate-200">
              {urlBar}
            </div>
            <span className="text-slate-400">↻</span>
          </div>
          <div className="relative bg-slate-50 min-h-[220px] sm:min-h-[240px]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function MockupScene({ type }) {
  if (type === 'in-app-menu') {
    return (
      <PhoneChrome>
        <div className="p-3 space-y-2 opacity-40">
          <div className="h-3 bg-slate-200 rounded w-3/4" />
          <div className="h-3 bg-slate-200 rounded w-full" />
          <div className="h-3 bg-slate-200 rounded w-5/6" />
        </div>
        <Arrow className="absolute top-2 right-3" label="Toca ··· aquí" flip />
        <div className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-lg font-black shadow-lg ring-4 ring-amber-400/80 animate-pulse">
          ⋯
        </div>
      </PhoneChrome>
    );
  }

  if (type === 'in-app-safari') {
    return (
      <PhoneChrome>
        <div className="absolute top-10 right-2 w-44 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden text-[10px] font-bold z-10">
          <div className="px-3 py-2.5 border-b text-slate-400">Opciones</div>
          <div className="px-3 py-2.5 bg-blue-50 text-blue-700 ring-2 ring-amber-400">Abrir en Safari</div>
          <div className="px-3 py-2.5 text-slate-500">Copiar enlace</div>
        </div>
        <Arrow className="absolute top-24 right-8" label="Elige esto" flip />
      </PhoneChrome>
    );
  }

  if (type === 'safari-ready') {
    return (
      <PhoneChrome>
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 mb-3 flex items-center justify-center text-2xl">📲</div>
          <p className="text-xs font-black text-slate-700 uppercase">OXY Agenda</p>
          <p className="text-[10px] text-emerald-600 font-bold mt-2">✓ Abierto en Safari</p>
        </div>
      </PhoneChrome>
    );
  }

  if (type === 'chrome-menu') {
    return (
      <PhoneChrome>
        <Arrow className="absolute top-2 right-3" label="Toca ⋮" flip />
        <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-sm font-black shadow-lg ring-4 ring-amber-400/80 animate-pulse">
          ⋮
        </div>
      </PhoneChrome>
    );
  }

  if (type === 'chrome-share') {
    return (
      <PhoneChrome>
        <div className="absolute top-10 right-2 w-44 rounded-xl bg-white border shadow-xl text-[10px] font-bold z-10 overflow-hidden">
          <div className="px-3 py-2.5 bg-blue-50 text-blue-700 ring-2 ring-amber-400 flex items-center gap-2">
            <span>↗</span> Compartir…
          </div>
          <div className="px-3 py-2.5 text-slate-500">Nueva pestaña</div>
        </div>
        <Arrow className="absolute top-24 right-10" label="Compartir" flip />
      </PhoneChrome>
    );
  }

  if (type === 'safari-share-iphone') {
    return (
      <PhoneChrome>
        <div className="p-4 pt-8 space-y-2 opacity-30">
          <div className="h-2 bg-slate-200 rounded w-full" />
          <div className="h-2 bg-slate-200 rounded w-4/5" />
        </div>
        <div className="absolute bottom-0 inset-x-0 h-12 bg-slate-200/90 border-t border-slate-300 flex items-center justify-around px-6 text-slate-500 text-lg">
          <span>←</span>
          <span>→</span>
          <span className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center text-base shadow-lg ring-4 ring-amber-400 animate-pulse">↗</span>
          <span>📖</span>
          <span>⊡</span>
        </div>
        <Arrow className="absolute bottom-14 left-1/2 -translate-x-1/2" label="Compartir" />
      </PhoneChrome>
    );
  }

  if (type === 'safari-share-ipad') {
    return (
      <PhoneChrome>
        <Arrow className="absolute top-2 right-12" label="Compartir" flip />
        <div className="absolute top-2 right-2 w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-lg ring-4 ring-amber-400 animate-pulse text-base">
          ↗
        </div>
      </PhoneChrome>
    );
  }

  if (type === 'share-sheet-add') {
    return <MockupScene type="share-sheet-scroll" />;
  }

  if (type === 'safari-required') {
    return (
      <PhoneChrome>
        <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-3xl">🧭</div>
          <p className="text-xs font-black text-slate-700 uppercase">Safari</p>
          <p className="text-[10px] text-slate-500 font-bold">Chrome no puede instalar apps en iPhone</p>
        </div>
      </PhoneChrome>
    );
  }

  if (type === 'share-sheet-scroll') {
    return (
      <PhoneChrome urlBar="">
        <div className="absolute inset-0 bg-black/20 z-0" />
        <div className="absolute inset-x-1 bottom-0 rounded-t-2xl bg-white shadow-2xl z-10 max-h-[210px] flex flex-col overflow-hidden text-[9px]">
          <div className="w-10 h-1 bg-slate-300 rounded mx-auto mt-2 mb-2 shrink-0" />
          <div className="px-3 pb-1 flex items-center gap-2 border-b border-slate-100 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-white text-[8px]">📲</div>
            <div>
              <p className="font-black text-slate-800 text-[10px]">OXY Agenda</p>
              <p className="text-slate-400 font-semibold">oxy-agenda.vercel.app</p>
            </div>
          </div>
          <div className="px-2 py-2 flex gap-3 overflow-hidden shrink-0 opacity-80">
            {['AirDrop', 'Mensajes', 'Mail', 'Notas'].map((l) => (
              <div key={l} className="shrink-0 flex flex-col items-center gap-0.5 w-12">
                <div className="w-9 h-9 rounded-xl bg-slate-200" />
                <span className="text-[7px] font-bold text-slate-500 text-center">{l}</span>
              </div>
            ))}
          </div>
          <div className="px-2 pb-1 flex gap-2 shrink-0 opacity-70">
            {['Copiar', 'Lecturas'].map((l) => (
              <div key={l} className="flex flex-col items-center w-12">
                <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200" />
                <span className="text-[7px] text-slate-500 mt-0.5">{l}</span>
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-hidden relative border-t border-slate-100 mt-1">
            <div className="px-3 py-1.5 text-slate-400 border-b border-slate-50">Abrir en Chrome</div>
            <div className="px-3 py-1.5 text-slate-400 border-b border-slate-50">Buscar en Google</div>
            <div className="px-3 py-2.5 flex items-center gap-2 bg-emerald-50 text-emerald-800 font-black ring-2 ring-amber-400 animate-pulse">
              <span className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center text-sm">+</span>
              Agregar a pantalla de inicio
            </div>
            <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-white to-transparent pointer-events-none" />
          </div>
        </div>
        <Arrow className="absolute bottom-[4.5rem] left-1/2 -translate-x-1/2" label="Desliza arriba ↑" />
        <p className="absolute bottom-1 left-0 right-0 text-center text-[8px] font-black text-amber-300 uppercase z-20">
          No está arriba con AirDrop — baja en la lista
        </p>
      </PhoneChrome>
    );
  }

  if (type === 'confirm-add') {
    return (
      <PhoneChrome>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-bold text-blue-600">Cancelar</span>
            <span className="text-[11px] font-black text-slate-700">Agregar a Inicio</span>
            <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg ring-2 ring-amber-400 animate-pulse">Agregar</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-xl">📲</div>
            <div>
              <p className="text-sm font-black text-slate-800">OXY Agenda</p>
              <p className="text-[10px] text-slate-500">oxy-agenda.vercel.app</p>
            </div>
          </div>
        </div>
        <Arrow className="absolute top-3 right-2" label="Agregar" flip />
      </PhoneChrome>
    );
  }

  return null;
}

export default function IosInstallWizard({ ctx, locale = 'es', onDismiss, onDone, className = 'z-[100002]' }) {
  const wizard = useMemo(() => getIosWizardSteps(ctx, locale), [ctx, locale]);
  const ui = IOS_WIZARD_UI[locale] || IOS_WIZARD_UI.es;
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const step = wizard.steps[stepIndex];
  const isLast = stepIndex >= wizard.steps.length - 1;
  const progress = ((stepIndex + 1) / wizard.steps.length) * 100;

  const runAutoAction = async (action) => {
    if (!action) return;
    setBusy(true);
    try {
      if (action === 'copy-url') {
        await navigator.clipboard.writeText(wizard.url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } else if (action === 'open-external') {
        const join = wizard.url.includes('?') ? '&' : '?';
        window.open(`${wizard.url}${join}pwa=1`, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => setStepIndex((i) => Math.min(i + 1, wizard.steps.length - 1)), 600);
      }
    } catch {
      /* cancelado */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${className} bg-slate-950 flex flex-col text-white overflow-hidden`}>
      <div className="shrink-0 px-4 pt-4 pb-3 safe-area-top">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">
              {ui.header(stepIndex + 1, wizard.steps.length)}
            </p>
            <h2 className="text-lg font-black leading-tight mt-0.5">{step.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(false)}
            className="text-slate-400 hover:text-white text-sm font-bold uppercase shrink-0 px-2 py-1"
          >
            {ui.later}
          </button>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center justify-center min-h-0">
        {step.warn && (
          <p className="text-xs text-amber-200 font-bold text-center max-w-sm mb-4 bg-amber-950/60 border border-amber-600/50 rounded-xl px-3 py-2.5 leading-relaxed">
            ⚠️ {step.warn}
          </p>
        )}

        <p className="text-sm text-slate-300 text-center leading-relaxed max-w-sm mb-5 font-medium">
          {step.body}
        </p>

        <MockupScene type={step.mockup} />

        {step.id === 'share' && (
          <p className="mt-4 text-[11px] text-blue-200 font-bold text-center max-w-xs">
            {ui.shareTip}
          </p>
        )}
      </div>

      <div className="shrink-0 p-4 pb-6 space-y-2 bg-slate-950 border-t border-slate-800 safe-area-bottom">
        {step.autoLabel && step.autoAction && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAutoAction(step.autoAction)}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-emerald-950 font-black py-4 rounded-2xl text-sm uppercase shadow-lg transition"
          >
            {busy ? ui.opening : `⚡ ${step.autoLabel}`}
          </button>
        )}

        {!isLast ? (
          <button
            type="button"
            onClick={() => setStepIndex((i) => i + 1)}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl text-sm uppercase transition"
          >
            {ui.next}
          </button>
        ) : (
          <button
            type="button"
            onClick={onDone}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl text-sm uppercase transition"
          >
            {wizard.flow === 'in-app' ? ui.doneInApp : ui.doneInstalled}
          </button>
        )}

        {step.autoAction === 'copy-url' && copied && (
          <p className="text-center text-xs text-emerald-400 font-bold">{ui.linkCopied}</p>
        )}

        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStepIndex((i) => i - 1)}
            className="w-full text-slate-500 font-bold py-2 text-xs uppercase"
          >
            {ui.prev}
          </button>
        )}
      </div>
    </div>
  );
}
