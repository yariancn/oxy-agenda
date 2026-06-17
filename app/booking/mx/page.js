'use client';

import PublicBookingPortal from '../../../components/PublicBookingPortal';

export default function BookingMX() {
  return (
    <PublicBookingPortal
      clinicName="Guadalajara"
      portalTag="GDL"
      locale="es"
      branding={{
        title: 'OxyHyperbaric GDL',
        subtitle: 'Reservas en línea Guadalajara',
        accent: 'emerald',
        timezone: 'America/Mexico_City',
        defaultLada: '+52',
      }}
    />
  );
}
