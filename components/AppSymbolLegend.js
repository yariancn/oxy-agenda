'use client';

import React from 'react';
import { useStaffLocale } from './StaffLocaleContext';

const FALLBACK_LEGEND = {
  es: {
    title: 'Símbolos de la app',
    intro: 'Referencia de iconos en agenda y expediente.',
    close: 'Cerrar',
    viewAll: 'Ver todos',
    shortcutsHint: '',
    sectionAgenda: 'Agenda',
    sectionStatus: 'Estado',
    sectionPatients: 'Expediente',
    sectionPortal: 'Portal',
    legendAvailable: 'Hueco libre',
    legendOutsideHours: 'Fuera de horario',
    legendExtended: 'Sesión extendida',
    legendNewPatient: 'Paciente nueva',
    legendSharedWallet: 'Cartera compartida',
    statusArrived: 'Llegó',
    statusInSession: 'En sesión',
    statusDone: 'Finalizado',
    statusNoShow: 'No asistió',
    statusExcused: 'Falta justificada',
    statusReturned: 'Devuelto',
    chartPackages: 'Expediente',
    sharedPackagesWhere: 'Paquete compartido',
    patientBlocked: 'Bloqueado',
    debtSessions: 'Adeudo',
    portalAvailable: 'Disponible',
    portalOccupied: 'Ocupado',
    portalBlocked: 'Bloqueado',
  },
  en: {
    title: 'App symbols',
    intro: 'Icon reference for schedule and charts.',
    close: 'Close',
    viewAll: 'View all',
    shortcutsHint: '',
    sectionAgenda: 'Schedule',
    sectionStatus: 'Status',
    sectionPatients: 'Charts',
    sectionPortal: 'Portal',
    legendAvailable: 'Open slot',
    legendOutsideHours: 'Off hours',
    legendExtended: 'Extended',
    legendNewPatient: 'New patient',
    legendSharedWallet: 'Shared wallet',
    statusArrived: 'Arrived',
    statusInSession: 'In session',
    statusDone: 'Done',
    statusNoShow: 'No-show',
    statusExcused: 'Excused',
    statusReturned: 'Returned',
    chartPackages: 'Chart',
    sharedPackagesWhere: 'Shared package',
    patientBlocked: 'Blocked',
    debtSessions: 'Debt',
    portalAvailable: 'Available',
    portalOccupied: 'Occupied',
    portalBlocked: 'Blocked',
  },
};

export default function AppSymbolLegend({ open, onClose, variant = 'modal' }) {
  const { locale, L } = useStaffLocale();

  if (!open && variant === 'modal') return null;

  const t = L.symbolLegend || FALLBACK_LEGEND[locale === 'en' ? 'en' : 'es'];

  const sections = [
    {
      title: t.sectionAgenda,
      items: [
        { icon: '▢', className: 'bg-emerald-100 border border-emerald-300 w-4 h-4 rounded', label: t.legendAvailable },
        { icon: '🟡', label: t.legendOutsideHours },
        { icon: '🟣', label: t.legendExtended },
        { icon: '⭐', label: t.legendNewPatient },
        { icon: '👥', label: t.legendSharedWallet },
      ],
    },
    {
      title: t.sectionStatus,
      items: [
        { icon: '🚶', label: t.statusArrived },
        { icon: '🟢', label: t.statusInSession },
        { icon: '✔️', label: t.statusDone },
        { icon: '❌', label: t.statusNoShow },
        { icon: '📋', label: t.statusExcused },
        { icon: '↩️', label: t.statusReturned },
      ],
    },
    {
      title: t.sectionPatients,
      items: [
        { icon: '💳', label: t.chartPackages },
        { icon: '👥', label: t.sharedPackagesWhere },
        { icon: '🚫', label: t.patientBlocked },
        { icon: '🟠', label: t.debtSessions },
      ],
    },
    {
      title: t.sectionPortal,
      items: [
        { icon: '🟢', label: t.portalAvailable },
        { icon: '⚫', label: t.portalOccupied },
        { icon: '🟠', label: t.portalBlocked },
      ],
    },
  ];

  const content = (
    <div className="space-y-4">
      <p className="text-[10px] font-bold text-slate-600 leading-relaxed normal-case">{t.intro}</p>
      {sections.map((section) => (
        <div key={section.title}>
          <h4 className="text-[10px] font-black uppercase text-slate-500 mb-2">{section.title}</h4>
          <ul className="space-y-1.5">
            {section.items.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-[10px] font-bold text-slate-700 normal-case">
                <span className="shrink-0 w-6 text-center leading-none pt-0.5">
                  {item.className ? (
                    <span className={`inline-block ${item.className}`} />
                  ) : (
                    item.icon
                  )}
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-[9px] font-bold text-slate-400 normal-case">{t.shortcutsHint}</p>
    </div>
  );

  if (variant === 'inline') {
    if (!open) return null;
    return (
      <div className="flex flex-wrap gap-2 px-1 pb-1 text-[9px] font-bold text-slate-600 border-t border-slate-100 pt-2">
        {sections[0].items.slice(0, 4).map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
            {item.icon} {item.label}
          </span>
        ))}
        <button type="button" onClick={onClose} className="text-blue-600 underline uppercase font-black text-[9px]">
          {t.viewAll}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[100001]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900 text-white px-5 py-4 flex justify-between items-center rounded-t-2xl">
          <h3 className="text-sm font-black uppercase">{t.title}</h3>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-5">{content}</div>
        <div className="p-4 border-t">
          <button type="button" onClick={onClose} className="w-full bg-slate-900 text-white font-black py-3 rounded-xl uppercase text-xs">
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
