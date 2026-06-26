-- Plantillas de WhatsApp para registrar en Meta Business Manager
-- Categoría: UTILIDAD (utility) | Idioma: Español (MEX) es_MX
-- Los nombres deben coincidir con las variables WHATSAPP_TEMPLATE_* en Vercel
-- Número solo API: incluir redirección a recepción +52 33 2166 4083 en el cuerpo

-- programacion (first + booking) — número dedicado API
-- Variables cuerpo: {{1}} nombre, {{2}} fecha, {{3}} hora, {{4}} servicio
/*
Hola {{1}}, confirmamos tu cita en Oxygengdl.

Fecha: {{2}}
Hora: {{3}}
Servicio: {{4}}

Para dudas o cambios escríbenos al +52 33 2166 4083 (WhatsApp de la clínica).
Este número solo envía confirmaciones automáticas.
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
