"use client";
import React, { useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import { buildPosTicketHtml } from '../lib/posTicket';
import { printThermalHtml } from '../lib/printReceipt';
import { applyPurchaseSessions, reversePurchaseSessions } from '../lib/sessionWallet';
import PatientSessionHistory from './PatientSessionHistory';

export default function PatientProfileModal({
  initialData,
  onSave,
  onClose,
  servicios,
  appointments = [],
  companyConfig = {},
  currentUserLevel,
  activeClinic = 'Guadalajara',
  onAllocateTicketNumber,
  onLogSale,
  onCancelSale,
}) {
  const { locale, L } = useStaffLocale();
  const t = L.modals.patient;
  const canCancelSales = currentUserLevel <= 2;

  const [formData, setFormData] = useState({
    id: initialData.patientId || initialData.patient_id || null,
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
    adeudo: Number(initialData.adeudo) || 0,
  });

  const [posService, setPosService] = useState('');
  const [posQty, setPosQty] = useState(1);
  const [posUnitPrice, setPosUnitPrice] = useState('');
  const [posPrice, setPosPrice] = useState('');
  const [posPaymentMethod, setPosPaymentMethod] = useState(locale === 'en' ? 'Credit Card' : 'Tarjeta de Crédito');
  const [posNotes, setPosNotes] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [charging, setCharging] = useState(false);
  const [printResult, setPrintResult] = useState(null);
  const [lastPurchaseNote, setLastPurchaseNote] = useState('');

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

  const currency = activeClinic === 'Shenandoah' ? 'USD' : 'MXN';

  const buildReceiptHtml = (tx) => buildPosTicketHtml({
    receipt: tx,
    companyConfig,
    clinicName: activeClinic,
    locale,
    labels: t,
    origin: typeof window !== 'undefined' ? window.location.origin : '',
  });

  const runPrint = async (tx) => {
    setPrintResult('printing');
    const result = await printThermalHtml(
      buildReceiptHtml(tx),
      locale === 'en' ? 'POS receipt' : 'Ticket POS',
    );
    setPrintResult(result.ok ? 'ok' : 'error');
    return result;
  };

  const dismissReceipt = () => {
    setReceipt(null);
    setPrintResult(null);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const syncPosTotal = (qty, unit) => {
    const q = Number(qty) || 0;
    const u = parseFloat(unit) || 0;
    if (q > 0 && u > 0) setPosPrice(String(Math.round(u * q * 100) / 100));
  };

  const handleServiceSelect = (serviceName) => {
    setPosService(serviceName);
    if (servicios?.length) {
      const srv = servicios.find((s) => s.name === serviceName);
      if (srv) {
        const unit = String(srv.price || '');
        setPosQty(1);
        setPosUnitPrice(unit);
        setPosPrice(unit);
      }
    }
  };

  const handleQtyChange = (rawQty) => {
    const qty = parseInt(rawQty, 10) || 0;
    setPosQty(qty);
    syncPosTotal(qty, posUnitPrice);
  };

  const handleUnitPriceChange = (rawUnit) => {
    setPosUnitPrice(rawUnit);
    syncPosTotal(posQty, rawUnit);
  };

  const handlePurchase = async () => {
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

    const total = parseFloat(posPrice) || 0;
    const sessions = posQty;
    const unitPrice = sessions > 0 ? total / sessions : (parseFloat(posUnitPrice) || 0);

    setCharging(true);
    let ticketNumber = null;
    try {
      if (onAllocateTicketNumber) {
        ticketNumber = await onAllocateTicketNumber();
      }
    } catch {
      ticketNumber = null;
    } finally {
      setCharging(false);
    }

    const newTransaction = {
      id: Date.now(),
      ticketNumber: ticketNumber || Date.now(),
      date: new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      serviceName: posService,
      equipment: baseService,
      sessions,
      unitPrice,
      price: total,
      paymentMethod: posPaymentMethod,
      operator: locale === 'en' ? 'POS' : 'Caja POS',
      ticketNotes: posNotes.trim(),
      patient: formData.patient,
      phone: formData.phone,
      email: formData.email,
      dob: formData.dob,
      protocol: formData.protocol,
      debtCleared: 0,
      addedToWallet: 0,
    };

    setFormData((prev) => {
      const applied = applyPurchaseSessions(prev.wallets, prev.adeudo, baseService, posQty);
      newTransaction.debtCleared = applied.debtCleared;
      newTransaction.addedToWallet = applied.addedToWallet;
      if (applied.debtCleared > 0 || applied.addedToWallet > 0) {
        setLastPurchaseNote(t.purchaseDebtCleared(applied.debtCleared, applied.addedToWallet));
      }
      return {
        ...prev,
        wallets: applied.wallets,
        adeudo: applied.adeudo,
        packageHistory: [newTransaction, ...(prev.packageHistory || [])],
      };
    });

    onLogSale?.(newTransaction, formData.patient);

    setReceipt(newTransaction);
    await runPrint(newTransaction);

    setPosService('');
    setPosQty(1);
    setPosUnitPrice('');
    setPosPrice('');
    setPosNotes('');
    setPosPaymentMethod(paymentOptions[0].value);
  };

  const handleCancelTransaction = (txToCancel) => {
    if (!window.confirm(t.cancelPaymentConfirm(txToCancel.price, txToCancel.sessions, txToCancel.serviceName))) {
      return;
    }

    onCancelSale?.(txToCancel, formData.patient);

    setFormData((prev) => {
      const reversed = reversePurchaseSessions(prev.wallets, prev.adeudo, txToCancel);
      return {
        ...prev,
        wallets: reversed.wallets,
        adeudo: reversed.adeudo,
        packageHistory: prev.packageHistory.filter((tx) => tx.id !== txToCancel.id),
      };
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[120]">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
        <div className="bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
          <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-widest">{t.title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-black">&times;</button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 min-h-0">
          <PatientSessionHistory
            appointments={appointments}
            patientName={formData.patient}
            patientId={formData.id}
            maxHeightClass="max-h-60"
          />

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.fullName}</label>
              <input disabled={formData.is_blocked && currentUserLevel > 1} type="text" value={formData.patient} onChange={(e) => handleChange('patient', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-black text-slate-800 uppercase outline-none text-sm disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.phone}</label>
              <input disabled={formData.is_blocked && currentUserLevel > 1} type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold outline-none disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.email}</label>
              <input disabled={formData.is_blocked && currentUserLevel > 1} type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="correo@ejemplo.com" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold outline-none disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.receiptDob}</label>
              <input disabled={formData.is_blocked && currentUserLevel > 1} type="date" value={formData.dob || ''} onChange={(e) => handleChange('dob', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold outline-none disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.clinicalProtocol}</label>
              <select disabled={formData.is_blocked && currentUserLevel > 1} value={formData.protocol} onChange={(e) => handleChange('protocol', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-blue-700 uppercase outline-none disabled:opacity-50">
                <option value="Médico">Médico</option>
                <option value="Wellness">Wellness</option>
                <option value="InfraBaldan">InfraBaldan</option>
              </select>
            </div>
            <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase text-indigo-900">{t.notifyPrefsTitle}</p>
                <p className="text-[8px] font-bold text-indigo-800/90 mt-1">{t.notifyPrefsHint}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-[10px] font-black uppercase text-indigo-900 flex-1">
                  <input disabled={formData.is_blocked && currentUserLevel > 1} type="checkbox" checked={formData.prefers_sms} onChange={(e) => handleChange('prefers_sms', e.target.checked)} className="w-4 h-4 shrink-0" />
                  {t.receiveSms}
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-[10px] font-black uppercase text-indigo-900 flex-1">
                  <input disabled={formData.is_blocked && currentUserLevel > 1} type="checkbox" checked={formData.prefers_email} onChange={(e) => handleChange('prefers_email', e.target.checked)} className="w-4 h-4 shrink-0" />
                  {t.receiveEmail}
                </label>
              </div>
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
            {(formData.adeudo || 0) > 0 && (
              <div className="flex justify-between bg-orange-100 border-2 border-orange-400 p-2 rounded-lg text-[10px] font-black mb-2 text-orange-900">
                <span>{t.adeudoTitle}</span>
                <span>{t.adeudoSessions(formData.adeudo)}</span>
              </div>
            )}
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
                  <div key={tx.id} className="bg-white p-2 rounded border mb-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase">
                          #{tx.ticketNumber || tx.ticket_number || String(tx.id).slice(-6)} · {tx.serviceName} ({tx.sessions} {t.sessionsShort})
                        </p>
                        <p className="text-[8px] text-slate-400 uppercase">{tx.date} · ${tx.price}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button type="button" onClick={() => runPrint(tx)} className="text-[9px] font-black text-slate-700 uppercase px-2 py-1 border border-slate-200 rounded bg-slate-50">
                          {t.receiptReprint}
                        </button>
                        {canCancelSales && (
                          <button type="button" onClick={() => handleCancelTransaction(tx)} className="text-[9px] font-black text-red-600 uppercase px-2 py-1 border border-red-200 rounded">
                            {t.revert}
                          </button>
                        )}
                      </div>
                    </div>
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
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <label className="text-[8px] font-black uppercase text-blue-700 block mb-0.5">{t.sessions}</label>
                <input type="number" min={1} value={posQty} onChange={(e) => handleQtyChange(e.target.value)} className="w-full p-2 text-center font-black border rounded" />
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-blue-700 block mb-0.5">{t.unitPrice}</label>
                <input type="number" step="0.01" value={posUnitPrice} onChange={(e) => handleUnitPriceChange(e.target.value)} className="w-full p-2 font-black border rounded" />
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-blue-700 block mb-0.5">{t.method}</label>
                <select value={posPaymentMethod} onChange={(e) => setPosPaymentMethod(e.target.value)} className="w-full p-2 text-[10px] font-bold uppercase border rounded">
                  {paymentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[8px] font-black uppercase text-blue-700 block mb-0.5">{t.charge}</label>
              <input
                type="number"
                step="0.01"
                value={posPrice}
                onChange={(e) => setPosPrice(e.target.value)}
                className="w-full p-2.5 font-black border-2 border-blue-400 rounded-lg bg-white text-blue-900 text-sm"
              />
              {posQty > 0 && posUnitPrice && posPrice && (
                <p className="text-[9px] font-bold text-blue-800 mt-1 uppercase">
                  {t.posTotalPreview(posQty, parseFloat(posUnitPrice).toFixed(2), parseFloat(posPrice).toFixed(2), currency)}
                </p>
              )}
              {(formData.adeudo || 0) > 0 && (
                <p className="text-[9px] font-bold text-orange-700 mt-1 normal-case">
                  {t.adeudoSessions(formData.adeudo)} — {locale === 'en' ? 'payment clears debt first' : 'el cobro liquida adeudo primero'}
                </p>
              )}
              {lastPurchaseNote && (
                <p className="text-[9px] font-bold text-emerald-700 mt-1 normal-case">{lastPurchaseNote}</p>
              )}
              <p className="text-[8px] font-bold text-blue-600/80 mt-1 normal-case leading-snug">{t.walletHint}</p>
            </div>
            <textarea
              value={posNotes}
              onChange={(e) => setPosNotes(e.target.value)}
              placeholder={t.receiptNotesPlaceholder}
              className="w-full p-2 border border-blue-200 rounded-lg text-xs font-bold bg-white text-blue-900 mb-3"
              rows={2}
            />
            <button type="button" disabled={charging} onClick={handlePurchase} className="w-full bg-blue-600 text-white text-xs font-black uppercase py-3 rounded-lg disabled:opacity-60">
              {charging ? '...' : t.chargeTicket}
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
          <div className="bg-slate-100 rounded-xl max-w-sm w-full p-4 max-h-[90vh] overflow-y-auto">
            {printResult === 'error' && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-4">
                <p className="text-xs font-black text-red-800 uppercase mb-2">⚠️ {locale === 'en' ? 'Print error' : 'Error de impresión'}</p>
                <p className="text-[11px] font-bold text-red-700 leading-relaxed normal-case">{t.receiptPrintError}</p>
              </div>
            )}
            {printResult === 'printing' && (
              <p className="text-center text-[10px] font-black text-slate-500 mb-3 uppercase">{t.receiptPrinting}</p>
            )}
            {printResult === 'ok' && (
              <p className="text-center text-[10px] font-black text-emerald-700 mb-3 uppercase">{t.receiptPrintSent}</p>
            )}
            <div className="bg-white p-4 font-mono text-sm mb-4 uppercase overflow-x-auto" dangerouslySetInnerHTML={{ __html: buildReceiptHtml(receipt) }} />
            <div className="text-center text-[10px] font-bold text-slate-500 mb-3 normal-case">
              {receipt.sessions} {t.sessionsShort} · {t.receiptSubtotal} ${((receipt.unitPrice || 0) * receipt.sessions).toFixed(2)} {currency} · {t.receiptTotal} ${receipt.price.toFixed(2)} {currency}
            </div>
            <p className="text-[9px] text-slate-400 text-center mb-3 normal-case leading-relaxed">{t.receiptBtHint}</p>
            <div className="flex flex-col gap-2">
              {printResult === 'error' ? (
                <>
                  <button type="button" onClick={() => runPrint(receipt)} className="w-full bg-slate-900 text-white font-black py-3 rounded uppercase text-xs">{t.receiptReprint}</button>
                  <button type="button" onClick={dismissReceipt} className="w-full bg-emerald-600 text-white font-black py-3 rounded uppercase text-xs">{t.receiptPrintAccept}</button>
                </>
              ) : (
                <div className="flex gap-3">
                  <button type="button" onClick={dismissReceipt} className="flex-1 bg-slate-300 font-black py-3 rounded uppercase text-xs">{t.close}</button>
                  <button type="button" onClick={() => runPrint(receipt)} className="flex-1 bg-slate-900 text-white font-black py-3 rounded uppercase text-xs">{t.receiptReprint}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
