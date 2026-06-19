const BOOKING_URL = 'https://oxy-agenda.vercel.app/booking/us';
const PRIVACY_URL = 'https://oxyhyperbaric.com/privacy-policy';
const TERMS_URL = 'https://oxyhyperbaric.com/terms-and-conditions';

export const metadata = {
  title: 'SMS Terms | OxyHyperbaric',
  description: 'SMS consent and messaging terms for REGENOXY LLC appointment notifications.',
};

export default function SmsTermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <article className="max-w-2xl mx-auto px-6 py-12 prose prose-slate prose-sm">
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">SMS Terms &amp; Consent</h1>
        <p className="text-slate-500 font-semibold">
          REGENOXY LLC · OxyHyperbaric · Shenandoah, Texas
        </p>

        <h2>Program description</h2>
        <p>
          When you book at{' '}
          <a href={BOOKING_URL}>{BOOKING_URL}</a>,
          you may optionally agree to receive <strong>appointment-related text messages</strong> from REGENOXY LLC
          (OxyHyperbaric), including confirmations, reminders, rescheduling notices, and cancellation notices.
        </p>

        <h2>How you opt in</h2>
        <ol>
          <li>Complete the online booking form (service, date, time, name, phone, email).</li>
          <li>
            <strong>Check the unchecked box</strong> labeled consent to receive SMS (not pre-selected).
          </li>
          <li>Tap &quot;Confirm appointment.&quot; Consent is recorded with your booking.</li>
        </ol>
        <p>We do not send marketing SMS. Messages are transactional and tied to your care appointment.</p>

        <h2>Message frequency</h2>
        <p>Typically 1–3 messages per appointment (confirmation and reminder). Frequency varies with reschedules or cancellations.</p>

        <h2>Costs</h2>
        <p>Message and data rates may apply. Check with your wireless carrier.</p>

        <h2>Opt out &amp; help</h2>
        <ul>
          <li>Reply <strong>STOP</strong> to any message to unsubscribe from SMS.</li>
          <li>Reply <strong>HELP</strong> for assistance.</li>
          <li>You may also ask clinic staff to update your preferences.</li>
        </ul>

        <h2>Privacy &amp; terms</h2>
        <p>
          See our <a href={PRIVACY_URL}>Privacy Policy</a> and{' '}
          <a href={TERMS_URL}>Terms &amp; Conditions</a> for how we handle your information and provide services.
        </p>

        <h2>Contact</h2>
        <p>
          OxyHyperbaric · 256 Ed English Dr Bldg 4, Ste. E, Shenandoah, TX 77384<br />
          Phone: (713) 591-3379 · Email: hello@oxyhyperbaric.com
        </p>

        <p>
          <a href={BOOKING_URL} className="text-blue-600 font-bold">← Back to booking</a>
        </p>
      </article>
    </main>
  );
}
