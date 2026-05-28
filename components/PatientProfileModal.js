"use client";
import React, { useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';

export default function PatientProfileModal({ initialData, onSave, onClose, servicios, currentUserLevel }) {
  const { locale, a, L } = useStaffLocale();
  const t = L.modals.patient;

  const [formData, setFormData] = useState({
    id: initialData.id || null,
    patient: initialData.patient || '',
    phone: initialData.phone || '',
    email: initialData.email || '',
    dob: initialData.dob || '',
    protocol: initialData.protocol || 'Wellness',
    notes: initialData.patientNotes || initialData.notes || '',
    is_blocked: initialData.is_blocked || false,
    prefers_email: initialData.prefers_email !== false,
    prefers_sms: initialData.prefers_sms !== false,
    wallets: initialData.wallets || {},
    packageHistory: initialData.packageHistory || [],
    historicoSesiones: initialData.historicoSesiones || 0,
  });

  const [posService, setPosService] = useState('');
  const [posQty, setPosQty] = useState(1);
  const [posPrice, setPosPrice] = useState('');
  const [posPaymentMethod, setPosPaymentMethod] = useState(locale === 'en' ? 'Credit Card' : 'Tarjeta de Crédito');
  const [receipt, setReceipt] = useState(null);

  const paymentOptions = locale === 'en'
    ? [
        { value: 'Credit Card', label: t.payCredit },
        { value: 'Debit Card', label: t.payDebit },
        { value: 'Cash', label: t.payCash },
        { value: 'Transfer', label: t.payTransfer },
      ]
    : [
        { value: 'Tarjeta de Crédito', label: t.payCredit },
        { value: 'Tarjeta de Débito', label: t.payDebit },
        { value: 'Efectivo', label: t.payCash },
        { value: 'Transferencia', label: t.payTransfer },
      ];

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleServiceSelect = (serviceName) => {
    setPosService(serviceName);
    if (servicios?.length) {
      const srv = servicios.find((s) => s.name === serviceName);
      if (srv) {
        setPosQty(1);
        setPosPrice(srv.price || '');
      }
    }
  };

  const handlePurchase = () => {
    if (formData.is_blocked) {
      alert(t.blockedCharge);
      return;
    }
    if (!posService || posQty <= 0) {
      alert(t.selectValidService);
      return;
    }

    let baseService = posService;
    if (servicios?.length) {
      const srv = servicios.find((s) => s.name === posService);
      if (srv) baseService = srv.equipment;
    }

    const newTransaction = {
      id: Date.now(),
      date: new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      serviceName: posService,
      equipment: baseService,
      sessions: posQty,
      price: parseFloat(posPrice) || 0,
      paymentMethod: posPaymentMethod,
      operator: locale === 'en' ? 'POS' : 'Caja POS',
    };

    setFormData((prev) => {
      const currentBalance = prev.wallets[baseService] || 0;
      return {
        ...prev,
        wallets: { ...prev.wallets, [baseService]: currentBalance + posQty },
        packageHistory: [newTransaction, ...(prev.packageHistory || [])],
      };
    });

    setReceipt({ ...newTransaction, patient: formData.patient });
    setPosService('');
    setPosQty(1);
    setPosPrice('');
    setPosPaymentMethod(paymentOptions[0].value);
  };

  const handleCancelTransaction = (txToCancel) => {
    if (!window.confirm(t.cancelPaymentConfirm(txToCancel.price, txToCancel.sessions, txToCancel.serviceName))) {
      return;
    }

    setFormData((prev) => {
      const eqName = txToCancel.equipment || txToCancel.serviceName;
      const currentBalance = prev.wallets[eqName] || 0;
      const newBalance = Math.max(0, currentBalance - txToCancel.sessions);
      return {
        ...prev,
        wallets: { ...prev.wallets, [eqName]: newBalance },
        packageHistory: prev.packageHistory.filter((tx) => tx.id !== txToCancel.id),
      };
    });
  };

  const printHTML = (htmlContent, title) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<html><head><title>${title}</title></head><body style="margin:0;">${htmlContent}</body></html>`);
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 500);
  };

  const handlePrint = () => {
    const printContent = `
      <div style="width:48mm;font-family:monospace;font-size:11px;">
        <h2 style="text-align:center;font-size:16px;">OXYHYPERBARIC</h2>
        <p>${t.receiptDate} ${receipt.date}</p>
        <p>${t.receiptTicket} #${receipt.id.toString().slice(-6)}</p>
        <p><strong>${t.receiptClient}</strong> ${receipt.patient}</p>
        <p>${receipt.serviceName} · ${t.receiptSessions} ${receipt.sessions}</p>
        <p><strong>${t.receiptTotal}</strong> $${receipt.price.toFixed(2)}</p>
        <p>${t.receiptPaidWith} ${receipt.paymentMethod}</p>
        <p>${t.receiptServedBy} ${receipt.operator}</p>
        <p style="text-align:center;font-style:italic;">${t.receiptThanks}</p>
      </div>`;
    printHTML(printContent, locale === 'en' ? 'POS receipt' : 'Ticket POS');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[120]">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
        <div className="bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
          <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-widest">{t.title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-black">&times;</button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.fullName}</label>
              <input disabled={formData.is_blocked && currentUserLevel > 1} type="text" value={formData.patient} onChange={(e) => handleChange('patient', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-black text-slate-800 uppercase outline-none text-sm disabled:opacity-50" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.phone}</label>
                <input disabled={formData.is_blocked && currentUserLevel > 1} type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold outline-none disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.clinicalProtocol}</label>
                <select disabled={formData.is_blocked && currentUserLevel > 1} value={formData.protocol} onChange={(e) => handleChange('protocol', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-blue-700 uppercase outline-none disabled:opacity-50">
                  <option value="Médico">Médico</option>
                  <option value="Wellness">Wellness</option>
                  <option value="InfraBaldan">InfraBaldan</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-700">
                <input disabled={formData.is_blocked && currentUserLevel > 1} type="checkbox" checked={formData.prefers_sms} onChange={(e) => handleChange('prefers_sms', e.target.checked)} className="w-4 h-4" />
                {t.receiveSms}
              </label>
              <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-700">
                <input disabled={formData.is_blocked && currentUserLevel > 1} type="checkbox" checked={formData.prefers_email} onChange={(e) => handleChange('prefers_email', e.target.checked)} className="w-4 h-4" />
                {t.receiveEmail}
              </label>
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
            <label className="text-[10px] font-black uppercase text-amber-800 mb-2 block">{t.notesLabel}</label>
            <textarea disabled={formData.is_blocked && currentUserLevel > 1} value={formData.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder={t.notesPlaceholder} className="w-full p-3 border border-amber-200 rounded-lg text-xs font-bold bg-white text-amber-900 disabled:opacity-50" rows={2} />
            <p className="text-[8px] text-amber-600 mt-1 font-bold uppercase">{t.notesHint}</p>
          </div>

          {currentUserLevel === 1 && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-200 flex items-center justify-between">
              <div>
                <label className="text-[10px] font-black uppercase text-red-800">{t.blockTitle}</label>
                <p className="text-[8px] text-red-600 font-bold uppercase mt-1">{t.blockHint}</p>
              </div>
              <input type="checkbox" checked={formData.is_blocked} onChange={(e) => handleChange('is_blocked', e.target.checked)} className="w-5 h-5" />
            </div>
          )}

          {formData.is_blocked && currentUserLevel > 1 && (
            <div className="bg-red-600 p-4 rounded-xl text-white text-center">
              <span className="text-xs font-black uppercase">{t.profileBlocked}</span>
            </div>
          )}

          <div className={`p-4 rounded-xl border ${formData.is_blocked ? 'bg-slate-200 opacity-60' : 'bg-slate-50'}`}>
            <h4 className="text-[10px] font-black text-slate-500 uppercase mb-3">{t.walletTitle}</h4>
            <div className="flex justify-between bg-white p-2 rounded border text-[10px] font-black mb-2">
              <span>{t.sessionsTaken}</span>
              <span>{formData.historicoSesiones || 0}</span>
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase block mb-2">{t.pendingSessions}</span>
            {Object.keys(formData.wallets || {}).length ? (
              Object.entries(formData.wallets).map(([eq, qty]) => (
                <div key={eq} className={`flex justify-between p-2 rounded border mb-1 text-[10px] font-black ${qty > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className="uppercase">{eq}</span>
                  <span>{qty} {t.availableShort}</span>
                </div>
              ))
            ) : (
              <p className="text-[10px] italic text-slate-400 uppercase">{t.noBalance}</p>
            )}
            <div className="mt-3 pt-3 border-t">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-2">{t.paymentHistory}</span>
              {formData.packageHistory?.length ? (
                formData.packageHistory.map((tx) => (
                  <div key={tx.id} className="bg-white p-2 rounded border flex justify-between items-center mb-1">
                    <div>
                      <p className="text-[10px] font-bold uppercase">{tx.serviceName} ({tx.sessions} {t.sessionsShort})</p>
                      <p className="text-[8px] text-slate-400 uppercase">{tx.date} · ${tx.price}</p>
                    </div>
                    {currentUserLevel === 1 && (
                      <button type="button" onClick={() => handleCancelTransaction(tx)} className="text-[9px] font-black text-red-600 uppercase px-2 py-1 border border-red-200 rounded">
                        {t.revert}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-[10px] italic text-slate-400 uppercase">{t.noPurchases}</p>
              )}
            </div>
          </div>

          <div className={`p-4 rounded-xl border ${formData.is_blocked ? 'bg-slate-200 opacity-60 pointer-events-none' : 'bg-blue-50 border-blue-200'}`}>
            <h4 className="text-[10px] font-black text-blue-800 uppercase mb-3">{t.posTitle}</h4>
            <select value={posService} onChange={(e) => handleServiceSelect(e.target.value)} className="w-full bg-white border border-blue-300 rounded p-2 text-xs font-bold uppercase mb-3">
              <option value="">{t.selectService}</option>
              {servicios?.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <input type="number" min={1} value={posQty} onChange={(e) => setPosQty(parseInt(e.target.value, 10) || 0)} className="p-2 text-center font-black border rounded" placeholder={t.sessions} />
              <input type="number" value={posPrice} onChange={(e) => setPosPrice(e.target.value)} className="p-2 font-black border rounded" placeholder={t.charge} />
              <select value={posPaymentMethod} onChange={(e) => setPosPaymentMethod(e.target.value)} className="p-2 text-[10px] font-bold uppercase border rounded">
                {paymentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <button type="button" onClick={handlePurchase} className="w-full bg-blue-600 text-white text-xs font-black uppercase py-3 rounded-lg">
              {t.chargeTicket}
            </button>
          </div>
        </div>

        <div className="p-6 border-t flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 bg-slate-100 font-black py-3 rounded-xl uppercase text-xs">{t.close}</button>
          <button type="button" onClick={() => onSave(formData)} className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-xl uppercase text-xs">{t.saveProfile}</button>
        </div>
      </div>

      {receipt && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-[200]">
          <div className="bg-slate-100 rounded-xl max-w-sm w-full p-4">
            <div className="bg-white p-6 font-mono text-sm mb-4">
              <h2 className="font-bold text-lg uppercase text-center">OXYHYPERBARIC</h2>
              <p className="text-xs">{t.receiptDate} {receipt.date}</p>
              <p className="text-xs font-bold uppercase">{t.receiptClient} {receipt.patient}</p>
              <p className="text-xs uppercase">{receipt.serviceName}</p>
              <p className="font-bold mt-2">{t.receiptTotal} ${receipt.price.toFixed(2)}</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setReceipt(null)} className="flex-1 bg-slate-300 font-black py-3 rounded uppercase text-xs">{t.close}</button>
              <button type="button" onClick={handlePrint} className="flex-1 bg-slate-900 text-white font-black py-3 rounded uppercase text-xs">{t.printTicket}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
