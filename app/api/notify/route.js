import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { patientName, phone, email, date, time, equipment, clinicName, type, prefers_email, prefers_sms } = body;

    let emailStatus = 'No solicitado/No permitido';
    let smsStatus = 'No solicitado/No permitido';

    // 1. LÓGICA DE CORREO ELECTRÓNICO (RESEND)
    if (email && prefers_email && (type === 'both' || type === 'email')) {
      const resendKey = process.env.RESEND_API_KEY;
      
      if (!resendKey) {
        emailStatus = 'Falta RESEND_API_KEY en el servidor';
      } else {
        const fromEmail = clinicName.includes('Shenandoah') 
          ? 'Citas Regenoxy <citas@regenoxy.com>' 
          : 'Citas OxyHyperbaric <citas@oxyhyperbaric.com>';

        const emailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <h2 style="color: #0f172a; text-transform: uppercase;">Confirmación de Cita</h2>
            <p style="color: #334155;">Hola <strong>${patientName}</strong>,</p>
            <p style="color: #334155;">Tu espacio en <strong>${clinicName}</strong> está reservado exitosamente.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #059669; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>📅 Fecha:</strong> ${date}</p>
              <p style="margin: 5px 0;"><strong>⏰ Hora:</strong> ${time}</p>
              <p style="margin: 5px 0;"><strong>🏥 Servicio:</strong> ${equipment}</p>
            </div>
            <p style="font-size: 12px; color: #64748b;">Si necesitas cancelar o reprogramar, por favor contáctanos con anticipación.</p>
          </div>
        `;

        const emailReq = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail, 
            to: [email],
            subject: `Cita Confirmada - ${clinicName}`,
            html: emailHtml
          })
        });

        if (emailReq.ok) emailStatus = 'Enviado Correctamente';
        else emailStatus = 'Error al enviar por Resend';
      }
    }

    // 2. LÓGICA DE SMS (TWILIO)
    if (phone && prefers_sms && (type === 'both' || type === 'sms')) {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      if (!twilioSid || !twilioToken || !twilioPhone) {
        smsStatus = 'Faltan credenciales de Twilio en el servidor';
      } else {
        const cleanPhone = phone.replace(/\s+/g, '');
        const smsBody = `Hola ${patientName}, tu cita en ${clinicName} para ${equipment} está confirmada para el ${date} a las ${time}.`;

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const twilioData = new URLSearchParams({
          To: cleanPhone,
          From: twilioPhone,
          Body: smsBody
        });

        const smsReq = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: twilioData
        });

        if (smsReq.ok) smsStatus = 'Enviado Correctamente';
        else smsStatus = 'Error al enviar SMS';
      }
    }

    return NextResponse.json({ success: true, report: { email: emailStatus, sms: smsStatus } });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}