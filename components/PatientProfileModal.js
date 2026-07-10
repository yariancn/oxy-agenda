"use client";
import React, { useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import PosReceiptModal from './PosReceiptModal';
import { applyPurchaseSessions, priceWalletKey, reversePurchaseSessions, sumWalletBalance, resolveWalletStorageKey, formatWalletKeyLabel, repairLegacyWalletKeys } from '../lib/sessionWallet';
import { sumPurchasedSessions } from '../lib/sessionSummary';
import { canCreateSessionGroup, canJoinSessionGroup, isGroupTitular } from '../lib/sessionGroup';
import PatientSessionHistory from './PatientSessionHistory';

export default function PatientProfileModal({
  initialData,
  onSave,
  onClose,
  servicios,
  appointments = [],
  companyConfig = {},
  currentUserLevel,
  activeClinic = 'Oxygengdl',
  onAllocateTicketNumber,
  onLogSale,
  onCancelSale,
  sessionGroupsEnabled = false,
  sessionGroup = null,
  allPatients = [],
  onCreateSessionGroup,
  onAddGroupMember,
  onRemoveGroupMember,
  onGroupPurchase,
  onGroupCancelSale,
  onPersistPurchase,
  onSessionUpdated,
}) {
  const { locale, L } = useStaffLocale();
  const t = L.modals.patient;
  const canCancelSales = currentUserLevel <= 2;

  const [formData, setFormData] = useState(() => {
    const repaired = repairLegacyWalletKeys(initialData.wallets || {}, initialData.packageHistory || []);
    return {
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
    wallets: repaired.wallets,
    packageHistory: initialData.packageHistory || [],
    historicoSesiones: initialData.historicoSesiones || 0,
    adeudo: Number(initialData.adeudo) || 0,
  };
  });

  const [posService, setPosService] = useState('');
  const [posQty, setPosQty] = useState(1);
  const [posUnitPrice, setPosUnitPrice] = useState('');
  const [posPrice, setPosPrice] = useState('');
  const [posPaymentMethod, setPosPaymentMethod] = useState(locale === 'en' ? 'Credit Card' : 'Tarjeta de Crédito');
  const [posNotes, setPosNotes] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [charging, setCharging] = useState(false);
  const [lastPurchaseNote, setLastPurchaseNote] = useState('');
  const [sharedGroupName, setSharedGroupName] = useState('');
  const [memberToAdd, setMemberToAdd] = useState('');
  const [sharedBusy, setSharedBusy] = useState(false);

  const canManageShared = currentUserLevel <= 2;
  const inGroup = Boolean(sessionGroup?.id || initialData.sessionGroupId);
  const isTitular = sessionGroup ? isGroupTitular({ id: formData.id }, sessionGroup) : false;
  const isMember = inGroup && !isTitular;
  const groupPurchased = sumPurchasedSessions(sessionGroup?.packageHistory || formData.packageHistory);
  const groupPending = sumWalletBalance(sessionGroup?.wallets || (isTitular ? {} : formData.wallets));

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

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const syncPosTotal = (qty, unit) => {
    const q = typeof qty === 'number' ? qty : parseInt(qty, 10);
    const u = parseFloat(unit) || 0;
    if (q > 0 && u > 0) setPosPrice(String(Math.round(u * q * 100) / 100));
  };

  const handleServiceSelect = (serviceName) => {
    setPosService(serviceName);
    if (servicios?.length) {
      const srv = servicios.find((s) => s.name === serviceName);
      if (srv) {
        const unit = String(srv.price || '');
        setPosUnitPrice(unit);
        const q = typeof posQty === 'number' ? posQty : parseInt(posQty, 10);
        if (q > 0) {
          syncPosTotal(q, unit);
        } else {
          setPosPrice(unit);
        }
      }
    }
  };

  const handleQtyChange = (rawQty) => {
    if (rawQty === '') {
      setPosQty('');
      return;
    }
    const qty = parseInt(String(rawQty), 10);
    if (Number.isNaN(qty)) return;
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
    if (!posService) {
      alert(t.selectValidService);
      return;
    }
    const qtyNum = typeof posQty === 'number' ? posQty : parseInt(posQty, 10);
    if (!qtyNum || qtyNum <= 0) {
      alert(t.selectValidService);
      return;
    }

    let baseService = posService;
    if (servicios?.length) {
      const srv = servicios.find((s) => s.name === posService);
      if (srv) baseService = srv.equipment;
    }

    const total = parseFloat(posPrice) || 0;
    const sessions = qtyNum;
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
      equipment: resolveWalletStorageKey({ serviceName: posService, equipment: baseService, unitPrice }),
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

    const useGroup = isTitular && sessionGroup?.id && onGroupPurchase;
    const walletKey = useGroup
      ? priceWalletKey(unitPrice)
      : resolveWalletStorageKey({ serviceName: posService, equipment: baseService, unitPrice });
    const applied = applyPurchaseSessions(
      useGroup ? (sessionGroup.wallets || {}) : formData.wallets,
      useGroup ? (sessionGroup.adeudo || 0) : formData.adeudo,
      walletKey,
      sessions,
    );
    newTransaction.debtCleared = applied.debtCleared;
    newTransaction.addedToWallet = applied.addedToWallet;
    newTransaction.unitPrice = unitPrice;
    if (applied.debtCleared > 0 || applied.addedToWallet > 0) {
      setLastPurchaseNote(t.purchaseDebtCleared(applied.debtCleared, applied.addedToWallet));
    }

    const nextPackageHistory = [newTransaction, ...(formData.packageHistory || [])];

    if (useGroup) {
      const nextGroupHistory = [newTransaction, ...(sessionGroup.packageHistory || [])];
      onGroupPurchase({
        groupId: sessionGroup.id,
        wallets: applied.wallets,
        adeudo: applied.adeudo,
        transaction: newTransaction,
      });
      onSessionUpdated?.({
        patientId: formData.id,
        sessionGroup: {
          ...sessionGroup,
          wallets: applied.wallets,
          adeudo: applied.adeudo,
          packageHistory: nextGroupHistory,
        },
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        wallets: applied.wallets,
        adeudo: applied.adeudo,
        packageHistory: nextPackageHistory,
      }));
      try {
        await onPersistPurchase?.({
          patientId: formData.id,
          wallets: applied.wallets,
          adeudo: applied.adeudo,
          packageHistory: nextPackageHistory,
          transaction: newTransaction,
        });
        onSessionUpdated?.({
          patientId: formData.id,
          wallets: applied.wallets,
          adeudo: applied.adeudo,
          packageHistory: nextPackageHistory,
        });
      } catch (err) {
        alert(err?.message || String(err));
        return;
      }
    }

    onLogSale?.(newTransaction, formData.patient);

    setReceipt(newTransaction);

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

    const useGroup = isTitular && sessionGroup?.id && onGroupCancelSale;
    if (useGroup) {
      onGroupCancelSale({ groupId: sessionGroup.id, transaction: txToCancel });
      return;
    }

    const reversed = reversePurchaseSessions(formData.wallets, formData.adeudo, txToCancel, formData.packageHistory);
    const nextHistory = (formData.packageHistory || []).filter((tx) => tx.id !== txToCancel.id);
    setFormData((prev) => ({
      ...prev,
      wallets: reversed.wallets,
      adeudo: reversed.adeudo,
      packageHistory: nextHistory,
    }));
    onPersistPurchase?.({
      patientId: formData.id,
      wallets: reversed.wallets,
      adeudo: reversed.adeudo,
      packageHistory: nextHistory,
    })?.then(() => {
      onSessionUpdated?.({
        patientId: formData.id,
        wallets: reversed.wallets,
        adeudo: reversed.adeudo,
        packageHistory: nextHistory,
      });
    })?.catch((err) => alert(err?.message || String(err)));
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

          {canManageShared && (
            <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-3">
              <p className="text-[11px] font-black uppercase text-indigo-900">{t.packagesSectionTitle}</p>
              <p className="text-[9px] font-bold text-indigo-800/90 mt-1 leading-snug normal-case">{t.packagesSectionHint}</p>
            </div>
          )}

          {canManageShared && (
            <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase text-violet-900">{t.sharedWalletTitle}</p>
                <p className="text-[8px] font-bold text-violet-800/90 mt-1 leading-snug">{t.sharedWalletHint}</p>
              </div>

              {!sessionGroupsEnabled && (
                <p className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-lg p-2 uppercase">{t.sharedWalletRunSql}</p>
              )}

              {sessionGroupsEnabled && !inGroup && canCreateSessionGroup({ ...formData, id: formData.id }).ok && (
                <div className="space-y-2 bg-white rounded-lg border border-violet-200 p-3">
                  <label className="text-[9px] font-black uppercase text-violet-800 block">{t.sharedWalletGroupName}</label>
                  <input
                    type="text"
                    value={sharedGroupName}
                    onChange={(e) => setSharedGroupName(e.target.value)}
                    placeholder={t.sharedWalletGroupNamePh}
                    className="w-full p-2.5 rounded-lg border border-violet-200 text-xs font-bold uppercase"
                  />
                  <button
                    type="button"
                    disabled={sharedBusy || !formData.id}
                    onClick={async () => {
                      setSharedBusy(true);
                      try {
                        await onCreateSessionGroup?.({
                          name: sharedGroupName.trim() || `Grupo ${formData.patient}`,
                          titularPatient: { ...formData, id: formData.id },
                        });
                        setSharedGroupName('');
                      } catch (e) {
                        const map = {
                          titular_debt: t.sharedWalletBlockedDebt,
                          already_in_group: t.sharedWalletBlockedOtherGroup,
                          member_debt: t.sharedWalletBlockedDebt,
                          group_debt: t.sharedWalletBlockedDebt,
                          member_has_wallet: t.sharedWalletBlockedMemberWallet,
                          other_group: t.sharedWalletBlockedOtherGroup,
                        };
                        alert(map[e.message] || e.message || String(e));
                      } finally {
                        setSharedBusy(false);
                      }
                    }}
                    className="w-full bg-violet-700 text-white text-[10px] font-black uppercase py-2.5 rounded-lg disabled:opacity-50"
                  >
                    {t.sharedWalletCreate}
                  </button>
                </div>
              )}

              {sessionGroupsEnabled && !inGroup && !canCreateSessionGroup({ ...formData, id: formData.id }).ok && (formData.adeudo || 0) > 0 && (
                <p className="text-[9px] font-black uppercase text-orange-800 bg-orange-100 border border-orange-300 rounded-lg p-2">{t.sharedWalletBlockedDebt}</p>
              )}

              {inGroup && sessionGroup && (
                <div className="bg-white rounded-lg border border-violet-200 p-3 space-y-2">
                  <p className="text-xs font-black uppercase text-violet-900">{sessionGroup.name}</p>
                  <p className="text-[10px] font-bold text-violet-800">{t.sharedWalletTitular(sessionGroup.titularName || '—')}</p>
                  <p className="text-[10px] font-black text-emerald-800">{t.sharedWalletRemaining(groupPending, groupPurchased)}</p>
                  {isMember && (
                    <p className="text-[9px] font-bold uppercase text-violet-700 bg-violet-100 rounded p-2">
                      {t.sharedWalletUsesGroup(sessionGroup.name, sessionGroup.titularName)}
                    </p>
                  )}
                  {isTitular && (
                    <>
                      <p className="text-[9px] font-black uppercase text-violet-700 mt-2">{t.sharedWalletMembers}</p>
                      <ul className="space-y-1">
                        {(sessionGroup.members || []).filter((m) => m.id !== formData.id).map((m) => (
                          <li key={m.id} className="flex justify-between items-center text-[10px] font-bold uppercase bg-slate-50 rounded px-2 py-1">
                            <span>{m.patient} · {m.historicoSesiones || 0} ses.</span>
                            <button
                              type="button"
                              disabled={sharedBusy}
                              onClick={async () => {
                                setSharedBusy(true);
                                try {
                                  await onRemoveGroupMember?.({ groupId: sessionGroup.id, memberId: m.id });
                                } finally {
                                  setSharedBusy(false);
                                }
                              }}
                              className="text-red-600 text-[9px] font-black"
                            >
                              {t.sharedWalletRemoveMember}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2 pt-2">
                        <select
                          value={memberToAdd}
                          onChange={(e) => setMemberToAdd(e.target.value)}
                          className="flex-1 p-2 rounded-lg border text-[10px] font-bold uppercase"
                        >
                          <option value="">{t.sharedWalletSelectMember}</option>
                          {(allPatients || [])
                            .filter((p) => p.id !== formData.id && !p.sessionGroupId)
                            .map((p) => (
                              <option key={p.id} value={p.id}>{p.patient}</option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={sharedBusy || !memberToAdd}
                          onClick={async () => {
                            const candidate = allPatients.find((p) => p.id === memberToAdd);
                            const check = canJoinSessionGroup(candidate, sessionGroup);
                            if (!check.ok) {
                              const msg = check.reason === 'member_debt' || check.reason === 'group_debt'
                                ? t.sharedWalletBlockedDebt
                                : check.reason === 'other_group'
                                  ? t.sharedWalletBlockedOtherGroup
                                  : check.reason === 'member_has_wallet'
                                    ? t.sharedWalletBlockedMemberWallet
                                    : check.reason;
                              return alert(msg);
                            }
                            setSharedBusy(true);
                            try {
                              await onAddGroupMember?.({ groupId: sessionGroup.id, memberPatient: candidate });
                              setMemberToAdd('');
                            } finally {
                              setSharedBusy(false);
                            }
                          }}
                          className="bg-violet-700 text-white text-[9px] font-black uppercase px-3 rounded-lg disabled:opacity-50"
                        >
                          {t.sharedWalletAddMember}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={`p-4 rounded-xl border ${formData.is_blocked ? 'bg-slate-200 opacity-60' : 'bg-slate-50'}`}>
            <h4 className="text-[10px] font-black text-slate-500 uppercase mb-3">{t.walletTitle}</h4>
            {isMember && (
              <p className="text-[9px] font-bold uppercase text-violet-700 bg-violet-100 border border-violet-200 rounded-lg p-2 mb-2">{t.sharedWalletIndividualPaused}</p>
            )}
            {((inGroup && sessionGroup ? sessionGroup.adeudo : formData.adeudo) || 0) > 0 && (
              <div className="flex justify-between bg-orange-100 border-2 border-orange-400 p-2 rounded-lg text-[10px] font-black mb-2 text-orange-900">
                <span>{t.adeudoTitle}</span>
                <span>{t.adeudoSessions(inGroup && sessionGroup ? sessionGroup.adeudo : formData.adeudo)}</span>
              </div>
            )}
            <div className="flex justify-between bg-white p-2 rounded border text-[10px] font-black mb-2">
              <span>{t.sessionsTaken}</span>
              <span>{formData.historicoSesiones || 0}</span>
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase block mb-2">{t.pendingSessions}</span>
            {isTitular && sessionGroup ? (
              Object.keys(sessionGroup.wallets || {}).length ? (
                Object.entries(sessionGroup.wallets).map(([eq, qty]) => (
                  <div key={eq} className={`flex justify-between p-2 rounded border mb-1 text-[10px] font-black ${qty > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <span className="uppercase">{formatWalletKeyLabel(eq.replace(/^price_/, ''), sessionGroup?.packageHistory)}</span>
                    <span>{qty} {t.availableShort}</span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] italic text-slate-400 uppercase">{t.noBalance}</p>
              )
            ) : isMember ? (
              <p className="text-[10px] font-bold text-violet-700 uppercase">{t.sharedWalletRemaining(groupPending, groupPurchased)}</p>
            ) : Object.keys(formData.wallets || {}).length ? (
              Object.entries(formData.wallets).map(([eq, qty]) => (
                <div key={eq} className={`flex justify-between p-2 rounded border mb-1 text-[10px] font-black ${qty > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className="uppercase">{formatWalletKeyLabel(eq, formData.packageHistory)}</span>
                  <span>{qty} {t.availableShort}</span>
                </div>
              ))
            ) : (
              <p className="text-[10px] italic text-slate-400 uppercase">{t.noBalance}</p>
            )}
            <div className="mt-3 pt-3 border-t">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-2">{t.paymentHistory}</span>
              {(isTitular && sessionGroup ? sessionGroup.packageHistory : formData.packageHistory)?.length ? (
                (isTitular && sessionGroup ? sessionGroup.packageHistory : formData.packageHistory).map((tx) => (
                  <div key={tx.id} className="bg-white p-2 rounded border mb-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase">
                          #{tx.ticketNumber || tx.ticket_number || String(tx.id).slice(-6)} · {tx.serviceName} ({tx.sessions} {t.sessionsShort})
                        </p>
                        <p className="text-[8px] text-slate-400 uppercase">{tx.date} · ${tx.price}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button type="button" onClick={() => setReceipt({ ...tx, phone: tx.phone || formData.phone })} className="text-[9px] font-black text-slate-700 uppercase px-2 py-1 border border-slate-200 rounded bg-slate-50">
                          {t.receiptGenerated}
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

          <div className={`p-4 rounded-xl border ${formData.is_blocked || isMember ? 'bg-slate-200 opacity-60 pointer-events-none' : 'bg-blue-50 border-blue-200'}`}>
            <h4 className="text-[10px] font-black text-blue-800 uppercase mb-3">{t.posTitle}</h4>
            {isMember && (
              <p className="text-[9px] font-bold uppercase text-violet-800 bg-violet-100 border border-violet-200 rounded-lg p-2 mb-3">
                {t.sharedWalletUsesGroup(sessionGroup?.name, sessionGroup?.titularName)}
              </p>
            )}
            <select value={posService} onChange={(e) => handleServiceSelect(e.target.value)} className="w-full bg-white border border-blue-300 rounded p-2 text-xs font-bold uppercase mb-3">
              <option value="">{t.selectService}</option>
              {servicios?.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <label className="text-[8px] font-black uppercase text-blue-700 block mb-0.5">{t.sessions}</label>
                <input type="number" value={posQty === '' ? '' : posQty} onChange={(e) => handleQtyChange(e.target.value)} className="w-full p-2 text-center font-black border rounded" />
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
              {typeof posQty === 'number' && posQty > 0 && posUnitPrice && posPrice && (
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
            <p className="text-[9px] font-bold text-blue-700/90 mb-3 normal-case leading-snug">
              {t.receiptAfterChargeHint}
            </p>
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

      <PosReceiptModal
        open={Boolean(receipt)}
        receipt={receipt}
        phone={formData.phone}
        companyConfig={companyConfig}
        activeClinic={activeClinic}
        locale={locale}
        labels={t}
        onClose={() => {
          setReceipt(null);
          if (isTitular && sessionGroup?.id) {
            onSessionUpdated?.({ patientId: formData.id, sessionGroup });
          } else {
            onSessionUpdated?.({
              patientId: formData.id,
              wallets: formData.wallets,
              adeudo: formData.adeudo,
              packageHistory: formData.packageHistory,
            });
          }
        }}
      />
    </div>
  );
}
