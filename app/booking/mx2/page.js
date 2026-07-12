'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** GDL2 está deshabilitada; redirige al portal de GDL 1. */
export default function BookingMX2() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/booking/mx');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center text-slate-600">
      <p>Esta sede no está disponible. Redirigiendo a Oxygengdl…</p>
    </div>
  );
}
