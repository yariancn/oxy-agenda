'use client';

import PublicBookingPortal from '../../../components/PublicBookingPortal';
import { supabaseShenandoah } from '../../../lib/supabase';

export default function BookingUS() {
  return (
    <PublicBookingPortal
      supabase={supabaseShenandoah}
      clinicName="Shenandoah"
      portalTag="TX"
      locale="en"
      branding={{
        title: 'Regenoxy Texas',
        subtitle: 'Shenandoah online booking',
        accent: 'blue',
        timezone: 'America/Chicago',
        defaultLada: '+1',
      }}
    />
  );
}
