"use client";
import React, { useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';

export default function GFEManager({ patients, onUpdatePatient }) {
  const { L } = useStaffLocale();
  const t = L.modals.gfe;
  const [filter, setFilter] = useState('');

  const filteredPatients = patients.filter((p) =>
    p.patient.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t.title}</h2>
          <p className="text-sm text-slate-500 font-medium">{t.subtitle}</p>
        </div>
        <input
          type="text"
          placeholder={t.search}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm w-64 max-w-full outline-none"
        />
      </div>

      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <th className="py-3 px-4">{t.colPatient}</th>
              <th className="py-3 px-4">{t.colGfeStatus}</th>
              <th className="py-3 px-4">{t.colGfeExpiry}</th>
              <th className="py-3 px-4">{t.colConsent}</th>
              <th className="py-3 px-4 text-right">{t.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPatients.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="py-4 px-4 font-bold text-slate-800">{p.patient}</td>
                <td className="py-4 px-4">
                  {p.gfeStatus === 'Activo' ? (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full">{t.authorized}</span>
                  ) : (
                    <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-1 rounded-full">{t.pending}</span>
                  )}
                </td>
                <td className="py-4 px-4 text-sm font-medium text-slate-600">{p.gfeExpiration || 'N/A'}</td>
                <td className="py-4 px-4">
                  {p.consentSigned ? (
                    <span className="text-emerald-600 font-bold text-xs">{t.signed}</span>
                  ) : (
                    <button type="button" className="text-blue-600 font-bold text-xs hover:underline">{t.linkSignNow}</button>
                  )}
                </td>
                <td className="py-4 px-4 text-right space-x-2">
                  <button type="button" className="bg-slate-900 text-white text-[10px] font-black px-3 py-1.5 rounded uppercase">{t.uploadPdf}</button>
                  <button type="button" className="bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded uppercase">{t.digitalExam}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
