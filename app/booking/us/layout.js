import MetaPixelOxy from '../../../components/MetaPixelOxy';

export const metadata = {
  title: 'Book Online | OxyHyperbaric — REGENOXY LLC',
  description:
    'Online appointment booking for REGENOXY LLC d/b/a OxyHyperbaric. Mild hyperbaric wellness in Shenandoah, Texas. Optional SMS consent for appointment confirmations.',
};

export default function BookingUSLayout({ children }) {
  return (
    <>
      <MetaPixelOxy />
      {children}
    </>
  );
}
