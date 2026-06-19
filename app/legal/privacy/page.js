export const metadata = {
  title: 'Privacy Policy | REGENOXY',
  description: 'Privacy policy for REGENOXY LLC online booking and patient communications.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <article className="max-w-2xl mx-auto px-6 py-12 prose prose-slate prose-sm">
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="text-slate-500 font-semibold">Last updated: May 2026</p>

        <p>
          REGENOXY LLC (&quot;we,&quot; &quot;us&quot;) operates hyperbaric and wellness services in Shenandoah, Texas.
          This policy describes how we collect and use information when you book online at{' '}
          <a href="https://oxy-agenda.vercel.app/booking/us">oxy-agenda.vercel.app/booking/us</a>.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>Name, phone number, and email when you schedule an appointment</li>
          <li>Optional notes you provide about your visit</li>
          <li>Appointment date, time, and service selected</li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>Schedule and manage your appointments</li>
          <li>Send appointment confirmations, reminders, and scheduling updates by email and/or SMS (only if you opt in to text messages)</li>
          <li>Operate our clinic and comply with law</li>
        </ul>

        <h2>SMS / text messages</h2>
        <p>
          We only send SMS if you actively check the consent box on our booking form.
          See our <a href="/legal/sms">SMS Terms</a> for frequency, opt-out (STOP), and help (HELP).
        </p>

        <h2>Sharing</h2>
        <p>
          We use service providers (e.g., Twilio for SMS, Resend for email, Supabase for data storage) to deliver messages and run booking.
          We do not sell your personal information.
        </p>

        <h2>Contact</h2>
        <p>
          REGENOXY LLC · Shenandoah, Texas<br />
          Questions: contact your clinic location or the phone number listed on our booking page.
        </p>

        <p>
          <a href="/booking/us" className="text-blue-600 font-bold">← Back to booking</a>
        </p>
      </article>
    </main>
  );
}
