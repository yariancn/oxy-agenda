import { sumWalletBalance, priceWalletKey } from './sessionWallet.js';

export function sumPurchasedSessions(packageHistory = []) {
  return (packageHistory || []).reduce((sum, tx) => sum + (Number(tx.sessions) || 0), 0);
}

export function getServicePrice(services = [], equipment) {
  const svc = (services || []).find((s) => s.name === equipment);
  return Number(svc?.price) || 0;
}

/**
 * Resumen de sesiones para bitácora, expediente y panel de cita.
 * Soporta cartera individual y compartida (grupo).
 */
export function buildSessionSummary({
  historicoSesiones = 0,
  adeudo = 0,
  wallets = {},
  packageHistory = [],
  equipment = '',
  servicePrice = 0,
  sessionGroup = null,
  groupMembers = [],
  patientName = '',
  locale = 'es',
}) {
  const isShared = Boolean(sessionGroup?.id);
  const groupWallets = sessionGroup?.wallets || {};
  const groupAdeudo = Number(sessionGroup?.adeudo) || 0;
  const groupHistory = sessionGroup?.packageHistory || sessionGroup?.package_history || [];
  const activeWallets = isShared ? groupWallets : wallets;
  const activeAdeudo = isShared ? groupAdeudo : adeudo;
  const activeHistory = isShared ? groupHistory : packageHistory;
  const totalPurchased = sumPurchasedSessions(activeHistory);
  const pendingTotal = sumWalletBalance(activeWallets);
  const used = Number(historicoSesiones) || 0;
  const price = Number(servicePrice) || 0;
  const priceKey = price ? priceWalletKey(price) : null;
  const pendingForService = priceKey
    ? (Number(activeWallets[priceKey]) || 0)
    : (Number(activeWallets[equipment]) || 0);

  const memberUsage = (groupMembers || [])
    .filter((m) => m.patient && m.patient !== patientName)
    .map((m) => ({
      name: m.patient,
      used: Number(m.historicoSesiones) || 0,
    }));

  const isDebtor = activeAdeudo > 0;
  const isCurrent = !isDebtor && totalPurchased > 0;
  const hasBalance = pendingForService > 0 || pendingTotal > 0;

  let status = 'unknown';
  if (isDebtor) status = 'debt';
  else if (totalPurchased === 0 && pendingTotal === 0) status = 'none';
  else if (hasBalance || used < totalPurchased) status = 'current';
  else status = 'exhausted';

  return {
    status,
    isShared,
    isDebtor,
    used,
    totalPurchased,
    pendingTotal,
    pendingForService,
    adeudo: activeAdeudo,
    servicePrice: price,
    equipment,
    groupName: sessionGroup?.name || '',
    titularName: sessionGroup?.titularName || '',
    memberUsage,
    groupUsedTotal: isShared
      ? (groupMembers || []).reduce((s, m) => s + (Number(m.historicoSesiones) || 0), 0)
      : used,
  };
}

export function formatSessionSummaryLines(summary, t) {
  const fmt = t || {};
  if (summary.isDebtor) {
    return {
      headline: fmt.debtHeadline?.(summary.adeudo) || `Debe ${summary.adeudo} sesión(es) sin pago`,
      detail: summary.isShared && summary.groupName
        ? (fmt.debtSharedDetail?.(summary.groupName, summary.titularName) || `Adeudo del grupo «${summary.groupName}»`)
        : (fmt.debtDetail || ''),
      tone: 'debt',
    };
  }

  if (summary.totalPurchased === 0 && summary.pendingTotal === 0) {
    return {
      headline: fmt.noPackageHeadline || 'Sin paquete pagado registrado',
      detail: fmt.noPackageDetail || 'Al sellar sin saldo se registrará adeudo.',
      tone: 'warn',
    };
  }

  const headline = fmt.currentHeadline?.(summary.used, summary.totalPurchased)
    || `Lleva ${summary.used} de ${summary.totalPurchased} sesiones pagadas`;

  let detail = fmt.currentDetail?.(summary.pendingTotal, summary.pendingForService, summary.equipment)
    || `${summary.pendingTotal} pendiente(s) por usar en cartera`;

  if (summary.isShared && summary.groupName) {
    detail = fmt.sharedDetail?.(
      summary.groupName,
      summary.pendingTotal,
      summary.totalPurchased,
      summary.used,
      summary.groupUsedTotal,
    ) || `Grupo «${summary.groupName}»: ${summary.pendingTotal} restante(s) de ${summary.totalPurchased} · Este paciente: ${summary.used} tomada(s)`;
    if (summary.memberUsage.length) {
      const others = summary.memberUsage.map((m) => `${m.name}: ${m.used}`).join(' · ');
      detail += ` · ${others}`;
    }
  }

  return { headline, detail, tone: summary.pendingForService > 0 ? 'ok' : 'warn' };
}
