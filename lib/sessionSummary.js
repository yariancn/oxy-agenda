import { sumWalletBalance, getAvailableWalletEntry } from './sessionWallet.js';
import { isAssessmentService } from './assessmentService.js';

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
  const isAssessment = isAssessmentService(equipment);
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
  const walletEntry = getAvailableWalletEntry(activeWallets, equipment, price);
  const pendingForService = walletEntry ? walletEntry.balance : 0;

  if (isAssessment) {
    return {
      status: 'assessment',
      isAssessment: true,
      skipsSessionPool: true,
      isShared,
      isDebtor: false,
      used,
      totalPurchased,
      pendingTotal,
      pendingForService,
      adeudo: activeAdeudo,
      servicePrice: price,
      equipment,
      groupName: sessionGroup?.name || '',
      titularName: sessionGroup?.titularName || '',
      memberUsage: [],
      groupUsedTotal: used,
    };
  }

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

export function formatSessionSummaryLines(summary, t, { skipCharge = false } = {}) {
  const fmt = t || {};
  const used = Number(summary?.used) || 0;
  const totalPurchased = Number(summary?.totalPurchased) || 0;
  const pendingTotal = Number(summary?.pendingTotal) || 0;
  const pendingForService = Number(summary?.pendingForService) || 0;
  const adeudo = Number(summary?.adeudo) || 0;
  const effectiveTotal = totalPurchased > 0
    ? totalPurchased
    : (pendingTotal > 0 ? used + pendingTotal : 0);
  const hasWalletForThisVisit = pendingForService > 0 || pendingTotal > 0;

  const buildThisVisit = () => {
    if (summary?.isAssessment) {
      return fmt.thisVisitAssessment
        || 'Esta visita es valoración: no cuenta como sesión del paquete.';
    }
    if (skipCharge) {
      return fmt.thisVisitCourtesy?.(used, effectiveTotal)
        || (effectiveTotal > 0
          ? `Cortesía: esta firma no cuenta. Siguen ${used} de ${effectiveTotal} tomadas.`
          : 'Cortesía: esta firma no descuenta cartera ni genera adeudo.');
    }
    if (hasWalletForThisVisit) {
      const thisNumber = used + 1;
      const remainingAfter = Math.max(0, pendingTotal - 1);
      if (effectiveTotal > 0) {
        return fmt.thisVisitPaid?.(used, effectiveTotal, thisNumber, remainingAfter)
          || `Ya tomadas: ${used} de ${effectiveTotal}. Esta firma es la #${thisNumber}. Queda${remainingAfter === 1 ? '' : 'n'} ${remainingAfter} pendiente${remainingAfter === 1 ? '' : 's'}.`;
      }
      return fmt.thisVisitPaidNoTotal?.(used, thisNumber, remainingAfter)
        || `Ya tomadas: ${used}. Esta firma es la #${thisNumber}. Quedan ${remainingAfter} pendiente(s).`;
    }
    // No wallet → sealing creates / increases debt.
    const nextAdeudo = adeudo + 1;
    if (effectiveTotal > 0) {
      return fmt.thisVisitDebt?.(used, effectiveTotal, adeudo, nextAdeudo)
        || `Ya tomadas: ${used} de ${effectiveTotal} (sin saldo). Esta firma suma adeudo (+1 → ${nextAdeudo}).`;
    }
    return fmt.thisVisitDebtNoPackage?.(adeudo, nextAdeudo)
      || `Sin saldo pagado. Esta firma registra adeudo (+1${adeudo > 0 ? ` → ${nextAdeudo}` : ''}).`;
  };

  if (summary.isAssessment) {
    return {
      headline: fmt.assessmentHeadline || 'Valoración (sin cargo de sesión)',
      detail: fmt.assessmentDetail || 'No descuenta cartera ni genera adeudo.',
      thisVisit: buildThisVisit(),
      tone: 'ok',
    };
  }
  if (summary.isDebtor && !hasWalletForThisVisit) {
    return {
      headline: fmt.debtHeadline?.(summary.adeudo) || `Debe ${summary.adeudo} sesión(es) sin pago`,
      detail: summary.isShared && summary.groupName
        ? (fmt.debtSharedDetail?.(summary.groupName, summary.titularName) || `Adeudo del grupo «${summary.groupName}»`)
        : (fmt.debtDetail || ''),
      thisVisit: buildThisVisit(),
      tone: skipCharge ? 'ok' : 'debt',
    };
  }

  if (summary.totalPurchased === 0 && summary.pendingTotal === 0) {
    return {
      headline: fmt.noPackageHeadline || 'Sin paquete pagado registrado',
      detail: fmt.noPackageDetail || 'Al sellar sin saldo se registrará adeudo.',
      thisVisit: buildThisVisit(),
      tone: skipCharge || summary?.isAssessment ? 'ok' : 'warn',
    };
  }

  const headline = fmt.currentHeadline?.(summary.used, summary.totalPurchased || effectiveTotal)
    || `Lleva ${summary.used} de ${summary.totalPurchased || effectiveTotal} sesiones pagadas`;

  let detail = fmt.currentDetail?.(summary.pendingTotal, summary.pendingForService, summary.equipment)
    || `${summary.pendingTotal} pendiente(s) por usar en cartera`;

  if (summary.isShared && summary.groupName) {
    detail = fmt.sharedDetail?.(
      summary.groupName,
      summary.pendingTotal,
      summary.totalPurchased || effectiveTotal,
      summary.used,
      summary.groupUsedTotal,
    ) || `Grupo «${summary.groupName}»: ${summary.pendingTotal} restante(s) de ${summary.totalPurchased} · Este paciente: ${summary.used} tomada(s)`;
    if (summary.memberUsage.length) {
      const others = summary.memberUsage.map((m) => `${m.name}: ${m.used}`).join(' · ');
      detail += ` · ${others}`;
    }
  }

  return {
    headline,
    detail,
    thisVisit: buildThisVisit(),
    tone: hasWalletForThisVisit && !skipCharge ? 'ok' : 'warn',
  };
}
