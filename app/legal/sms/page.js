import { redirect } from 'next/navigation';

export const metadata = {
  title: 'SMS Terms | OxyHyperbaric',
  description: 'SMS consent and messaging terms for REGENOXY LLC appointment notifications.',
};

export default function SmsTermsPage() {
  redirect('https://oxyhyperbaric.com/terms-and-conditions#sms-messaging');
}
