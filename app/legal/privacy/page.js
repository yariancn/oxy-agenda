import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Privacy Policy | OxyHyperbaric',
  description: 'Privacy policy for OxyHyperbaric online booking and patient communications.',
};

export default function PrivacyPolicyPage() {
  redirect('https://oxyhyperbaric.com/privacy-policy');
}
