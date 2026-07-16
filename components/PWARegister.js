'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js?v=20260716-deploy-banner').catch(() => {});
  }, []);

  return null;
}
