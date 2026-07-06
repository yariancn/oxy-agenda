'use client';

import { createContext, useContext, useMemo } from 'react';
import {
  getSessionPresetLabels,
  localeForClinic,
  staffAlert,
  staffStrings,
  translateCheckInStatus,
} from '../lib/i18n';
import { CLINIC_OXYGENDGL } from '../lib/clinicRegistry';

const StaffLocaleContext = createContext(null);

export function StaffLocaleProvider({ clinic, children }) {
  const locale = localeForClinic(clinic);
  const value = useMemo(
    () => ({
      locale,
      clinic,
      L: staffStrings(locale),
      a: (key, ...args) => staffAlert(locale, key, ...args),
      sessionPresets: getSessionPresetLabels(locale),
      status: (s) => translateCheckInStatus(locale, s),
    }),
    [locale, clinic],
  );
  return (
    <StaffLocaleContext.Provider value={value}>{children}</StaffLocaleContext.Provider>
  );
}

export function useStaffLocale() {
  const ctx = useContext(StaffLocaleContext);
  if (!ctx) {
    return {
      locale: 'es',
      clinic: CLINIC_OXYGENDGL,
      L: staffStrings('es'),
      a: (key, ...args) => staffAlert('es', key, ...args),
      sessionPresets: getSessionPresetLabels('es'),
      status: (s) => translateCheckInStatus('es', s),
    };
  }
  return ctx;
}

export { localeForClinic };
