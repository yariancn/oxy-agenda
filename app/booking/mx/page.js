'use client';

import PublicBookingPortal from '../../../components/PublicBookingPortal';
import { supabaseGdl } from '../../../lib/supabase';

export default function BookingMX() {
  return (
    <PublicBookingPortal
      supabase={supabaseGdl}
      clinicName="Guadalajara"
      portalTag="GDL"
      locale="es"
      branding={{
        title: 'OxyHyperbaric GDL',
        subtitle: 'Reservaciones Guadalajara',
        accent: 'emerald',
        timezone: 'America/Mexico_City',
        defaultLada: '+52',
      }}
    />
  );
}
