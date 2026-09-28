'use client';

import React, { useEffect, useState } from 'react';
import {
  getSavedNativePrinter,
  isCapacitorNative,
  saveNativePrinter,
  scanNativePrinters,
} from '../lib/nativePrint';

/**
 * Solo útil dentro de la app iPad (Capacitor).
 * En Safari/Chrome se muestra como informativo; no rompe nada.
 */
export default function NativePrinterSettings({ locale = 'es' }) {
  const es = locale !== 'en';
  const [native, setNative] = useState(false);
  const [saved, setSaved] = useState(null);
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setNative(isCapacitorNative());
    setSaved(getSavedNativePrinter());
  }, []);

  const onScan = async () => {
    setBusy(true);
    setError('');
    setDevices([]);
    try {
      const result = await scanNativePrinters({ timeoutMs: 10000 });
      if (!result.ok) {
        setError(result.error || (es ? 'No se pudo escanear Bluetooth.' : 'Bluetooth scan failed.'));
        return;
      }
      setDevices(result.devices || []);
      if (!(result.devices || []).length) {
        setError(es
          ? 'No se encontró ninguna impresora. Enciéndela y acércala al iPad.'
          : 'No printers found. Power it on and keep it near the iPad.');
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSelect = (device) => {
    saveNativePrinter(device);
    setSaved(getSavedNativePrinter());
  };

  const onClear = () => {
    saveNativePrinter(null);
    setSaved(null);
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 space-y-3">
      <h4 className="text-sm font-black text-amber-950 uppercase">
        {es ? 'Impresora Bluetooth (app iPad)' : 'Bluetooth printer (iPad app)'}
      </h4>
      <p className="text-xs text-amber-900/90 leading-relaxed">
        {es
          ? 'No cambia la impresión normal (AirPrint / diálogo del sistema) en otros equipos. Solo aplica cuando usas la app nativa Oxy Agenda en iPad.'
          : 'Does not change normal printing (AirPrint / system dialog) on other devices. Only applies inside the native Oxy Agenda iPad app.'}
      </p>

      {!native ? (
        <p className="text-xs font-bold text-amber-950 bg-white/80 border border-amber-200 rounded-xl px-3 py-2">
          {es
            ? 'Ahora estás en el navegador. Cuando abras la app iPad, aquí podrás buscar y guardar la GOOJPRT / térmica BLE.'
            : 'You are in the browser. In the iPad app you will be able to scan and save the GOOJPRT / BLE thermal printer here.'}
        </p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-slate-800">
            {saved?.deviceId
              ? (es ? `Guardada: ${saved.name || saved.deviceId}` : `Saved: ${saved.name || saved.deviceId}`)
              : (es ? 'Ninguna impresora guardada todavía.' : 'No printer saved yet.')}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onScan}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl bg-amber-700 text-white text-[10px] font-black uppercase disabled:opacity-60"
            >
              {busy ? (es ? 'Buscando…' : 'Scanning…') : (es ? 'Buscar impresoras BT' : 'Scan BT printers')}
            </button>
            {saved?.deviceId ? (
              <button
                type="button"
                onClick={onClear}
                className="px-4 py-2.5 rounded-xl bg-white border border-amber-300 text-amber-950 text-[10px] font-black uppercase"
              >
                {es ? 'Quitar impresora' : 'Clear printer'}
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="text-xs font-bold text-red-700">{error}</p>
          ) : null}
          {devices.length > 0 ? (
            <ul className="space-y-2">
              {devices.map((d) => (
                <li key={d.deviceId}>
                  <button
                    type="button"
                    onClick={() => onSelect(d)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-white border border-amber-200 hover:border-amber-500 text-xs font-bold text-slate-900"
                  >
                    {d.name || d.deviceId}
                    <span className="block text-[10px] font-medium text-slate-500 mt-0.5">{d.deviceId}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
