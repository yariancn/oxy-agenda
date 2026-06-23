'use client';

import PublicBookingPortal from '../../../components/PublicBookingPortal';

export default function BookingUS() {
  return (
    <PublicBookingPortal
      clinicName="Shenandoah"
      portalTag="TX"
      locale="en"
      branding={{
        title: 'OxyHyperbaric',
        subtitle: 'REGENOXY LLC · Shenandoah online booking',
        accent: 'blue',
        timezone: 'America/Chicago',
        defaultLada: '+1',
      }}
    />
  );
}
