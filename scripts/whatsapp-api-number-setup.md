# Número nuevo solo API (Guadalajara)

Confirmaciones automáticas por **WhatsApp Cloud API** en un **número distinto** al +52 de recepción (+52 33 2166 4083).

Recepción manual sigue en el WhatsApp Business del celular de la clínica.

## Requisitos del número nuevo

- **+52 México**, 10 dígitos (sin el 1 extra de Meta en display)
- Debe recibir **SMS o llamada** para OTP de Meta
- **No** debe estar registrado en WhatsApp / WhatsApp Business (número virgen o línea dedicada)
- WABA **Oxygengdl2** con **método de pago** activo

Opciones: línea prepago barata, eSIM, virtual móvil (no VoIP genérico — WhatsApp suele rechazarlos).

## IDs fijos

| Recurso | ID |
|---------|-----|
| App | `1664079171536415` |
| WABA | `289637057572952` |
| Recepción (no API) | +52 33 2166 4083 |

## Paso 0 — Token en terminal

```bash
cd ~/Downloads/oxy-agenda-main
export WHATSAPP_ACCESS_TOKEN="PEGAR_TOKEN_OXYGENDDLWHATS"
export WABA_ID=289637057572952
```

## Paso 1 — Listar números actuales

```bash
node scripts/whatsapp-api-number-setup.mjs list
```

## Paso 2 — Agregar número a la WABA (terminal)

Sustituye `33XXXXXXXX` por el número nuevo (10 dígitos, área 33 Guadalajara u otra):

```bash
node scripts/whatsapp-api-number-setup.mjs add \
  --cc 52 \
  --number 33XXXXXXXX \
  --name "Oxygengdl Citas"
```

Guarda el **`id`** que devuelve Meta → ese es el **Phone Number ID**.

**Alternativa UI:** WhatsApp Manager → Oxygengdl2 → Números → Agregar.

## Paso 3 — OTP

```bash
export PHONE_ID=EL_ID_DEL_PASO_2

node scripts/whatsapp-api-number-setup.mjs request-code --phone-id $PHONE_ID --method SMS
```

Cuando llegue el código:

```bash
export WHATSAPP_VERIFY_CODE=123456
node scripts/whatsapp-api-number-setup.mjs verify --phone-id $PHONE_ID
```

## Paso 4 — Registrar en Cloud API

Al agregar el número, Meta pide un **PIN de verificación en dos pasos** (6 dígitos). Guárdalo.

```bash
export WHATSAPP_REGISTER_PIN=123456
node scripts/whatsapp-api-number-setup.mjs register --phone-id $PHONE_ID
```

## Paso 5 — Suscribir app (si hace falta)

```bash
node scripts/whatsapp-api-number-setup.mjs subscribe
```

## Paso 6 — Estado

```bash
node scripts/whatsapp-api-number-setup.mjs status --phone-id $PHONE_ID
```

Debe mostrar `platform_type: CLOUD_API` y verificación OK.

## Paso 7 — Plantillas en Meta

En WhatsApp Manager → Plantillas, crea o aprueba (Utilidad, es_MX):

- `programacion`, `reprogramacion`, `cancelacion`, `oxy_staff_nueva_cita`

**Texto sugerido** (incluir redirección a recepción):

```
Hola {{1}}, confirmamos tu cita en Oxygengdl.

Fecha: {{2}}
Hora: {{3}}
Servicio: {{4}}

Para dudas o cambios escríbenos al WhatsApp de la clínica: +52 33 2166 4083.
Este número solo envía confirmaciones automáticas.
```

Lista plantillas:

```bash
node scripts/whatsapp-api-number-setup.mjs templates
```

## Paso 8 — Prueba de envío

```bash
node scripts/whatsapp-api-number-setup.mjs test \
  --phone-id $PHONE_ID \
  --to 523328332686 \
  --template programacion
```

## Paso 9 — Vercel (producción)

| Variable | Valor |
|----------|--------|
| `WHATSAPP_PHONE_NUMBER_ID` | Phone ID del número **nuevo** |
| `WHATSAPP_ACCESS_TOKEN` | Token oxygengdlwhats (sin cambio si mismo WABA) |

Redeploy → prueba cita en `/booking/mx`.

## Notas

- Las **respuestas** al número API no llegan al celular de recepción (sin webhook).
- Pacientes deben usar **+52 33 2166 4083** para dudas (texto en plantilla).
- El número viejo (+52 recepción) **no se toca**; sigue en WhatsApp Business app.
