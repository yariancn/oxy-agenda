'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isPublicPatientPath } from '../lib/installContext';

export default function PWARegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (isPublicPatientPath(pathname)) return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js?v=20260716-deploy-banner').catch(() => {});
  }, [pathname]);

  return null;
}
