import WhatsAppCoexistenceSetup from '../../../components/WhatsAppCoexistenceSetup';

export const metadata = {
  title: 'WhatsApp Coexistence Setup | Oxygengdl',
  description: 'Complete WhatsApp Business App coexistence onboarding for Cloud API.',
};

export default function WhatsAppSetupPage() {
  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <WhatsAppCoexistenceSetup />
    </div>
  );
}
