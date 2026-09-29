'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isPublicPatientPath } from '../lib/installContext';

export default function PWARegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Patient confirmation links: never register, and clear any prior SW for this origin
    // so the browser does not treat the page as an installable PWA.
    if (isPublicPatientPath(pathname)) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register('/sw.js?v=20260716-deploy-banner').catch(() => {});
  }, [pathname]);

  return null;
}
