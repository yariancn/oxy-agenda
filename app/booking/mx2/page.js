'use client';

import PublicBookingPortal from '../../../components/PublicBookingPortal';

export default function BookingMX2() {
  return (
    <PublicBookingPortal
      clinicName="Oxygengdl2"
      portalTag="GDL2"
      locale="es"
      branding={{
        title: 'Oxygengdl2',
        subtitle: 'Reservas en línea — sede 2',
        accent: 'teal',
        timezone: 'America/Mexico_City',
        defaultLada: '+52',
      }}
    />
  );
}
