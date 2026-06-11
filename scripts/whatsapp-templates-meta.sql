-- Plantillas de WhatsApp para registrar en Meta Business Manager
-- Categoría: UTILIDAD (utility) | Idioma: Español (MEX) es_MX
-- Los nombres deben coincidir con las variables WHATSAPP_TEMPLATE_* en Vercel

-- oxy_cita_confirmada (first + booking)
-- Variables cuerpo: {{1}} nombre, {{2}} clínica, {{3}} fecha, {{4}} hora, {{5}} servicio
/*
Hola {{1}}, confirmamos tu cita en {{2}}.

Fecha: {{3}}
Hora: {{4}}
Servicio: {{5}}

Si necesitas reprogramar, contáctanos.
*/

-- oxy_cita_reprogramada
-- Variables cuerpo: {{1}} nombre, {{2}} clínica, {{3}} fecha, {{4}} hora, {{5}} servicio
/*
Hola {{1}}, reprogramamos tu cita en {{2}}.

Nueva fecha: {{3}}
Hora: {{4}}
Servicio: {{5}}
*/

-- oxy_cita_cancelada
-- Variables cuerpo: {{1}} nombre, {{2}} clínica, {{3}} fecha y hora
/*
Hola {{1}}, cancelamos tu cita en {{2}} programada para {{3}}.

Contáctanos para reagendar.
*/

-- oxy_staff_nueva_cita (alertas al equipo en GDL)
-- Variables cuerpo: {{1}} origen, {{2}} paciente, {{3}} fecha, {{4}} hora, {{5}} servicio
/*
Nueva cita — {{1}}
Paciente: {{2}}
{{3}} {{4}}
Servicio: {{5}}
*/
