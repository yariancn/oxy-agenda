"use client";
import React, { useState } from 'react';

export default function PatientProfileModal({ initialData, onSave, onClose, servicios, currentUserLevel }) {
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
  const [posPaymentMethod, setPosPaymentMethod] = useState('Tarjeta de Crédito');

  const [receipt, setReceipt] = useState(null);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleServiceSelect = (serviceName) => {
    setPosService(serviceName);
    if (servicios && servicios.length > 0) {
      const srv = servicios.find(s => s.name === serviceName);
      if (srv) {
        setPosQty(srv.duration ? 1 : 1);
        setPosPrice(srv.price || ''); 
      }
    }
  };

  const handlePurchase = () => {
    if (formData.is_blocked) {
      alert("🚫 Este paciente se encuentra bloqueado por la administración. No se pueden procesar cobros.");
      return;
    }

    if (!posService || posQty <= 0) {
      alert("Selecciona un servicio y cantidad válida.");
      return;
    }

    let baseService = posService;
    if (servicios && servicios.length > 0) {
      const srv = servicios.find(s => s.name === posService);
      if (srv) baseService = srv.equipment;
    }

    const newTransaction = {
      id: Date.now(),
      date: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }),
      serviceName: posService,
      equipment: baseService, 
      sessions: posQty,
      price: parseFloat(posPrice) || 0,
      paymentMethod: posPaymentMethod, 
      operator: 'Caja POS' 
    };

    setFormData(prev => {
      const currentBalance = prev.wallets[baseService] || 0;
      return {
        ...prev,
        wallets: { ...prev.wallets, [baseService]: currentBalance + posQty },
        packageHistory: [newTransaction, ...(prev.packageHistory || [])]
      };
    });

    setReceipt({
      ...newTransaction,
      patient: formData.patient
    });

    setPosService('');
    setPosQty(1);
    setPosPrice('');
    setPosPaymentMethod('Tarjeta de Crédito');
  };

  const handleCancelTransaction = (txToCancel) => {
    if (!window.confirm(`¿Seguro que deseas CANCELAR este cobro de $${txToCancel.price} y revertir ${txToCancel.sessions} sesiones de ${txToCancel.serviceName}? Esta acción es irreversible.`)) {
      return;
    }

    setFormData(prev => {
      const eqName = txToCancel.equipment || txToCancel.serviceName; 
      const currentBalance = prev.wallets[eqName] || 0;
      const newBalance = Math.max(0, currentBalance - txToCancel.sessions);

      return {
        ...prev,
        wallets: { ...prev.wallets, [eqName]: newBalance },
        packageHistory: prev.packageHistory.filter(t => t.id !== txToCancel.id)
      };
    });
  };

  const printHTML = (htmlContent, title) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<html><head><title>${title}</title></head><body style="margin:0;">${htmlContent}</body></html>`);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  const handlePrint = () => {
    const printContent = `
      <style>
        @media print { 
          @page { margin: 0; size: 58mm auto; } 
          body { margin: 0; padding: 2mm; width: 58mm; } 
        }
      </style>
      <div style="width: 48mm; margin: 0; padding: 0; font-family: monospace; font-size: 11px; color: black; background: white;">
        <div style="text-align: center; margin-bottom: 15px;">
          <h2 style="margin: 0 0 5px 0; font-size: 16px; font-weight: bold; text-transform: uppercase;">OXYHYPERBARIC</h2>
          <p style="margin: 0 0 3px 0; font-size: 10px;">Shenandoah, TX</p>
          <p style="margin: 0 0 8px 0; font-size: 10px;">Tel: (832) 555-0000</p>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 10px; border-bottom: 1px dashed black; padding-bottom: 8px;">
          Fecha: ${receipt.date}<br/>
          Ticket: #${receipt.id.toString().slice(-6)}
        </p>
        <div style="margin-bottom: 8px; border-bottom: 1px dashed black; padding-bottom: 8px;">
          <p style="margin: 0 0 3px 0; font-size: 10px; font-weight: bold; text-transform: uppercase;">Cliente:</p>
          <p style="margin: 0 0 3px 0; font-size: 10px;">${receipt.patient}</p>
        </div>
        <div style="margin-bottom: 8px;">
          <p style="margin: 0 0 5px 0; font-size: 10px; text-transform: uppercase; font-weight: bold; border-bottom: 1px solid black; display: inline-block;">Descripción</p>
          <p style="margin: 0 0 3px 0; font-size: 10px; text-transform: uppercase;">${receipt.serviceName}</p>
          <p style="margin: 0 0 3px 0; font-size: 10px;">Sesiones: ${receipt.sessions}</p>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; border-top: 1px solid black; padding-top: 8px;">
          <span style="font-weight: bold; text-transform: uppercase; font-size: 12px;">TOTAL</span>
          <span style="font-weight: bold; font-size: 12px;">$${receipt.price.toFixed(2)} USD</span>
        </div>
        <div style="text-align: right; margin-top: 5px; font-size: 10px; font-weight: bold;">
          <p style="margin: 0;">PAGADO CON: <span style="text-transform: uppercase;">${receipt.paymentMethod}</span></p>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 9px;">
          <p style="margin: 0 0 5px 0;">Le atendió: ${receipt.operator}</p>
          <p style="margin: 0; font-style: italic;">¡Gracias por su preferencia!</p>
        </div>
      </div>
    `;
    printHTML(printContent, 'Ticket POS');
  };

  const handleSaveClick = () => {
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[120]">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
        
        <div className="bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
          <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
            👤 Expediente & POS
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-black">&times;</button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 min-h-0">
          
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nombre Completo</label>
              <input disabled={formData.is_blocked && currentUserLevel > 1} type="text" value={formData.patient} onChange={(e) => handleChange('patient', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-black text-slate-800 uppercase focus:border-blue-500 outline-none shadow-sm disabled:opacity-50 text-sm" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Celular</label>
                <input disabled={formData.is_blocked && currentUserLevel > 1} type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-slate-800 focus:border-blue-500 outline-none shadow-sm disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Protocolo Clínico</label>
                <select disabled={formData.is_blocked && currentUserLevel > 1} value={formData.protocol} onChange={(e) => handleChange('protocol', e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-blue-700 uppercase focus:border-blue-500 outline-none shadow-sm disabled:opacity-50">
                  <option value="Médico">Médico</option>
                  <option value="Wellness">Wellness</option>
                  <option value="InfraBaldan">InfraBaldan</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 sm:p-0 bg-slate-50 sm:bg-transparent border sm:border-0 border-slate-200 rounded-xl">
              <div className="flex items-center gap-2">
                <input disabled={formData.is_blocked && currentUserLevel > 1} type="checkbox" checked={formData.prefers_sms} onChange={e => handleChange('prefers_sms', e.target.checked)} className="w-4 h-4 cursor-pointer" />
                <label className="text-[10px] font-black uppercase text-slate-700 cursor-pointer">Recibir SMS</label>
              </div>
              <div className="flex items-center gap-2">
                <input disabled={formData.is_blocked && currentUserLevel > 1} type="checkbox" checked={formData.prefers_email} onChange={e => handleChange('prefers_email', e.target.checked)} className="w-4 h-4 cursor-pointer" />
                <label className="text-[10px] font-black uppercase text-slate-700 cursor-pointer">Recibir Correo</label>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm">
            <label className="text-[10px] font-black uppercase text-amber-800 flex items-center gap-1 mb-2">⚠️ Notas Generales / Alertas del Expediente</label>
            <textarea
              disabled={formData.is_blocked && currentUserLevel > 1}
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Ej. Paciente claustrofóbico, diabético..."
              className="w-full p-3 border border-amber-200 rounded-lg text-xs font-bold outline-none bg-white text-amber-900 disabled:opacity-50"
              rows="2"
            />
            <p className="text-[8px] text-amber-600 mt-1 font-bold uppercase">Esta información se guardará en su perfil permanente.</p>
          </div>

          {currentUserLevel === 1 && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm flex items-center justify-between">
              <div>
                <label className="text-[10px] font-black uppercase text-red-800 flex items-center gap-1">🚫 Bloqueo Médico</label>
                <p className="text-[8px] text-red-600 font-bold uppercase mt-1">Impide agendar o cobrar a este paciente.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={formData.is_blocked} onChange={(e) => handleChange('is_blocked', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>
          )}
          
          {formData.is_blocked && currentUserLevel > 1 && (
            <div className="bg-red-600 p-4 rounded-xl text-white shadow-sm flex items-center justify-center">
              <span className="text-xs font-black uppercase tracking-widest">🚫 Perfil Bloqueado por Administración</span>
            </div>
          )}

          <div className={`p-4 rounded-xl border shadow-sm ${formData.is_blocked ? 'bg-slate-200 border-slate-300 opacity-60' : 'bg-slate-50 border-slate-200'}`}>
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2">Cartera de Sesiones</h4>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 shadow-sm">
                <span className="text-[10px] font-black text-slate-600 uppercase">Total Sesiones Tomadas</span>
                <span className="text-xs font-black text-slate-800">{formData.historicoSesiones || 0}</span>
              </div>
              
              <div className="pt-2 mt-2 border-t border-slate-200">
                <span className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Pendientes por Tomar</span>
                {Object.keys(formData.wallets || {}).length > 0 ? (
                  Object.entries(formData.wallets).map(([eq, qty]) => (
                    <div key={eq} className={`flex justify-between items-center p-2 rounded border shadow-sm mb-1 ${qty > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <span className={`text-[10px] font-black uppercase ${qty > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{eq}</span>
                      <span className={`text-sm font-black ${qty > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{qty} Disp.</span>
                    </div>
                  ))
                ) : (
                   <p className="text-[10px] font-bold text-slate-400 uppercase italic">Sin saldo disponible</p>
                )}
              </div>

              <div className="pt-2 mt-2 border-t border-slate-200">
                 <span className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Historial de Cobros</span>
                 {formData.packageHistory && formData.packageHistory.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                       {formData.packageHistory.map(tx => (
                          <div key={tx.id} className="bg-white p-2 rounded border border-slate-200 shadow-sm flex justify-between items-center">
                             <div>
                                <p className="text-[10px] font-bold text-slate-800 uppercase">{tx.serviceName} <span className="text-blue-600">({tx.sessions} ses.)</span></p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">{tx.date} • ${tx.price} • {tx.paymentMethod}</p>
                             </div>
                             {currentUserLevel === 1 && (
                                <button onClick={() => handleCancelTransaction(tx)} className="text-[9px] font-black uppercase text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-1 rounded transition" title="Cancelar Pago y Revertir Sesiones">
                                   Revertir
                                </button>
                             )}
                          </div>
                       ))}
                    </div>
                 ) : (
                    <p className="text-[10px] font-bold text-slate-400 uppercase italic">Sin compras recientes</p>
                 )}
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-xl border shadow-sm ${formData.is_blocked ? 'bg-slate-200 border-slate-300 opacity-60 pointer-events-none' : 'bg-blue-50 border-blue-200'}`}>
            <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-3 border-b border-blue-200 pb-2">Punto de Venta / Recarga</h4>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black text-blue-600 uppercase mb-1">Servicio / Paquete a Vender</label>
                <select value={posService} onChange={(e) => handleServiceSelect(e.target.value)} className="w-full bg-white border border-blue-300 rounded p-2 text-xs font-bold uppercase outline-none text-blue-900">
                  <option value="">Seleccione un servicio...</option>
                  {servicios && servicios.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-blue-600 uppercase mb-1">Sesiones</label>
                  <input type="number" min="1" value={posQty} onChange={(e) => setPosQty(parseInt(e.target.value) || 0)} className="w-full bg-white border border-blue-300 rounded p-2 text-center text-sm font-black text-blue-900 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-emerald-600 uppercase mb-1">Cobro ($)</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 font-black text-emerald-500">$</span>
                    <input type="number" value={posPrice} onChange={(e) => setPosPrice(e.target.value)} className="w-full bg-white border border-emerald-400 rounded p-2 pl-6 text-sm font-black text-emerald-700 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-blue-600 uppercase mb-1">Método</label>
                  <select value={posPaymentMethod} onChange={(e) => setPosPaymentMethod(e.target.value)} className="w-full bg-white border border-blue-300 rounded p-2 text-[10px] font-bold uppercase text-blue-900 outline-none">
                    <option value="Tarjeta de Crédito">Crédito</option>
                    <option value="Tarjeta de Débito">Débito</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transf.</option>
                  </select>
                </div>
              </div>

              <button onClick={handlePurchase} className="w-full bg-blue-600 text-white text-xs font-black uppercase py-3 rounded-lg hover:bg-blue-700 transition shadow-md mt-2 flex justify-center items-center gap-2">
                💳 Cobrar y Generar Ticket
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 pt-0 shrink-0 bg-white border-t border-slate-200">
          <div className="flex space-x-3 pt-4">
            <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 font-black py-3 rounded-xl hover:bg-slate-200 transition uppercase text-xs shadow-sm">Cerrar</button>
            <button onClick={handleSaveClick} className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-xl hover:bg-emerald-700 shadow-md transition uppercase text-xs">💾 Guardar Perfil</button>
          </div>
        </div>

      </div>

      {receipt && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[200]">
          <div className="bg-slate-100 rounded-xl max-w-sm w-full p-4 flex flex-col items-center shadow-2xl">
            
            <div className="bg-white p-6 w-full max-w-[300px] shadow-sm mb-4 border border-slate-300 text-sm" style={{ fontFamily: 'monospace' }}>
              <div className="text-center mb-4">
                <h2 className="font-bold text-lg uppercase">OXYHYPERBARIC</h2>
                <p className="text-xs">Shenandoah, TX</p>
                <p className="text-xs">Tel: (832) 555-0000</p>
              </div>
              <p className="text-xs border-b border-dashed border-black pb-2 mb-2">
                Fecha: {receipt.date}<br/>
                Ticket: #${receipt.id.toString().slice(-6)}
              </p>
              <div className="mb-2 border-b border-dashed border-black pb-2">
                <p className="text-xs font-bold uppercase">Cliente:</p>
                <p className="text-xs">{receipt.patient}</p>
              </div>
              <div className="mb-2">
                <p className="text-xs uppercase font-bold border-b border-black">Descripción</p>
                <p className="text-xs mt-1 uppercase">{receipt.serviceName}</p>
                <p className="text-xs">Sesiones: {receipt.sessions}</p>
              </div>
              <div className="flex justify-between items-center mt-4 border-t border-black pt-2">
                <span className="font-bold uppercase">TOTAL</span>
                <span className="font-bold">${receipt.price.toFixed(2)}</span>
              </div>
              
              <div className="text-right mt-2 text-xs font-bold text-slate-700 uppercase">
                Pago vía: {receipt.paymentMethod}
              </div>

              <div className="text-center mt-6 text-[10px]">
                <p>Le atendió: {receipt.operator}</p>
                <p className="mt-2">¡Gracias por su preferencia!</p>
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button onClick={() => setReceipt(null)} className="flex-1 bg-slate-300 text-slate-800 font-black py-3 rounded hover:bg-slate-400 transition uppercase text-xs">Cerrar</button>
              <button onClick={handlePrint} className="flex-1 bg-slate-900 text-white font-black py-3 rounded hover:bg-slate-800 transition uppercase text-xs shadow-md">🖨️ Imprimir Ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
