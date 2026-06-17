'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import IosInstallWizard from './IosInstallWizard';
import {
  getInstallContext,
  getInstallSteps,
  INSTALL_DISMISS_KEY,
  INSTALL_GUIDE_EVENT,
  INSTALL_SESSION_KEY,
  shouldAutoShowInstallGuide,
} from '../lib/installContext';
import { INSTALL_GUIDE_COPY, localeFromPathname } from '../lib/i18n';

const GUIDE_Z = 'z-[100002]';

function readContext() {
  if (typeof window === 'undefined') return null;
  return getInstallContext();
}

function isStaffInstallPath(pathname) {
  if (!pathname) return false;
  return !pathname.startsWith('/booking');
}

export default function InstallGuide() {
  const pathname = usePathname();
  const staffOnly = isStaffInstallPath(pathname);
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshContext = useCallback(() => {
    setCtx(getInstallContext());
  }, []);

  useEffect(() => {
    refreshContext();
  }, [refreshContext, deferredPrompt]);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const onOpenGuide = () => {
      if (isStaffInstallPath(window.location.pathname)) setOpen(true);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener(INSTALL_GUIDE_EVENT, onOpenGuide);
    window.addEventListener('appinstalled', onInstalled);

    if (isStaffInstallPath(window.location.pathname)) {
      const context = getInstallContext();
      if (shouldAutoShowInstallGuide(context)) {
        setOpen(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener(INSTALL_GUIDE_EVENT, onOpenGuide);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const installLocale = useMemo(
    () => (typeof window !== 'undefined' ? localeFromPathname(window.location.pathname) : 'es'),
    [],
  );
  const ig = INSTALL_GUIDE_COPY[installLocale] || INSTALL_GUIDE_COPY.es;
  const content = useMemo(() => (ctx ? getInstallSteps(ctx, installLocale) : null), [ctx, installLocale]);

  const dismiss = (remember = false) => {
    sessionStorage.setItem(INSTALL_SESSION_KEY, '1');
    if (remember) localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    setOpen(false);
  };

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      dismiss(true);
    } catch {
      /* usuario canceló */
    } finally {
      setInstalling(false);
    }
  };

  const copyUrl = async () => {
    const url = window.location.origin;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  };

  const handleIosDone = () => {
    if (ctx?.iosFlow === 'safari' || ctx?.iosFlow === 'chrome') {
      dismiss(true);
    } else {
      dismiss(false);
    }
  };

  if (!staffOnly) return null;
  if (!ctx || ctx.isStandalone) return null;

  const isIosWizard = ctx.platform === 'ios' && open;
  const showFab = !open;

  if (isIosWizard) {
    return (
      <IosInstallWizard
        ctx={ctx}
        locale={installLocale}
        className={GUIDE_Z}
        onDismiss={dismiss}
        onDone={handleIosDone}
      />
    );
  }

  return (
    <>
      {showFab && (
        <InstallFab className={GUIDE_Z} ig={ig} onOpen={() => setOpen(true)} />
      )}

      {open && content && (
        <div
          className={`fixed inset-0 ${GUIDE_Z} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-sm`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
        >
          <div className="bg-white w-full sm:max-w-md max-h-[92dvh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            <div className="bg-gradient-to-br from-slate-900 to-blue-900 px-5 sm:px-6 py-5 text-white shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-200 mb-1">
                    {ig.firstTime}
                  </p>
                  <h2 id="install-guide-title" className="text-xl font-black leading-tight">
                    {content.title}
                  </h2>
                  <p className="text-sm text-slate-200 mt-2 leading-relaxed">
                    {content.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(false)}
                  className="text-slate-300 hover:text-white text-2xl font-black leading-none shrink-0 p-1"
                  aria-label={ig.close}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4 text-slate-800">
              {deferredPrompt && (
                <button
                  type="button"
                  onClick={handleNativeInstall}
                  disabled={installing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black py-4 rounded-2xl uppercase text-sm shadow-lg transition"
                >
                  {installing ? ig.installing : ig.installNow}
                </button>
              )}

              {content.steps.length > 0 && (
                <ol className="space-y-3">
                  {content.steps.map((step, index) => (
                    <li
                      key={step.text}
                      className="flex gap-3 items-start bg-slate-50 border border-slate-100 rounded-2xl p-3.5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-sm font-black text-blue-800">
                        {index + 1}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <span className="text-lg leading-none mr-1.5" aria-hidden>{step.icon}</span>
                        <span className="text-sm font-semibold leading-snug">{step.text}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {ctx.needsSafariOnIos && (
                <button
                  type="button"
                  onClick={copyUrl}
                  className="w-full border-2 border-dashed border-blue-200 bg-blue-50 text-blue-800 font-black py-3 rounded-xl text-xs uppercase hover:bg-blue-100 transition"
                >
                  {copied ? ig.copied : ig.copyUrl}
                </button>
              )}

              {content.tip && (
                <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-xl p-3 leading-relaxed">
                  <span className="font-black text-amber-700">{ig.tip}</span>
                  {content.tip}
                </p>
              )}

              <div className="rounded-2xl bg-slate-900 text-slate-300 p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  {ig.afterInstall}
                </p>
                <p className="text-sm font-bold text-white">{ig.afterInstallBody}</p>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t bg-slate-50 shrink-0 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => dismiss(false)}
                className="w-full bg-blue-600 text-white font-black py-3.5 rounded-xl uppercase text-xs hover:bg-blue-700 transition"
              >
                {ig.understood}
              </button>
              <button
                type="button"
                onClick={() => dismiss(true)}
                className="w-full text-slate-400 font-bold py-2 text-[11px] uppercase hover:text-slate-600 transition"
              >
                {ig.dismiss}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InstallFab({ onOpen, className, ig }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`fixed bottom-20 lg:bottom-6 right-4 ${className} flex items-center gap-2 bg-blue-600 text-white text-[11px] font-black uppercase tracking-wide px-4 py-3 rounded-2xl shadow-xl hover:bg-blue-700 transition active:scale-95`}
      aria-label={ig.fabAria}
    >
      <span className="text-base leading-none" aria-hidden>📲</span>
      {ig.fab}
    </button>
  );
}

export function InstallGuideLink({ className = '' }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/booking')) return null;

  const installLocale = typeof window !== 'undefined' ? localeFromPathname(window.location.pathname) : 'es';
  const ig = INSTALL_GUIDE_COPY[installLocale] || INSTALL_GUIDE_COPY.es;
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(INSTALL_SESSION_KEY);
          window.dispatchEvent(new CustomEvent(INSTALL_GUIDE_EVENT));
        }
      }}
      className={className || 'text-[11px] font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2 transition'}
    >
      {ig.link}
    </button>
  );
}
