# SMS México — Guadalajara (LabsMobile)

Confirmaciones de cita por **SMS** en lugar de WhatsApp. Houston sigue con **Twilio**.

Panel: [websms.labsmobile.com](https://websms.labsmobile.com)

## 1. Credenciales API

1. Inicia sesión en LabsMobile (cuenta **DEMO** incluye ~10 SMS de prueba)
2. **Mi cuenta** → **Configuración API** (o similar) → **Generar token**
3. Anota:
   - **Usuario** → `LABSMOBILE_USERNAME` (email o usuario del panel)
   - **Token API** → `LABSMOBILE_API_TOKEN`

Documentación: [LabsMobile API JSON POST](https://www.labsmobile.com/en/sms-api/api-versions/http-rest-post-json)

## 2. Variables en Vercel (proyecto oxy-agenda-gdl)

| Variable | Ejemplo | Notas |
|----------|---------|--------|
| `LABSMOBILE_USERNAME` | `yarianc@yahoo.com` | Usuario del panel |
| `LABSMOBILE_API_TOKEN` | `...` | Token generado en Mi cuenta |
| `LABSMOBILE_SENDER` | `OXYGENDL` | Remitente alfanumérico (máx. 11), opcional |
| `LABSMOBILE_TEST` | `1` | Modo simulado (no consume créditos) |

Redeploy después de guardar.

## 3. Probar en terminal

```bash
cd ~/Downloads/oxy-agenda-main

export LABSMOBILE_USERNAME="tu_usuario"
export LABSMOBILE_API_TOKEN="tu_token"
# Opcional: simulado sin gastar créditos DEMO
export LABSMOBILE_TEST=1

node scripts/sms-mx-test.mjs --to 3312345678 --message "Prueba Oxygengdl citas"
```

Para envío real (gasta 1 crédito de tu cuenta DEMO/producción), quita `LABSMOBILE_TEST`.

## 4. Formato API

```bash
POST https://api.labsmobile.com/json/send
Authorization: Basic base64(usuario:token)
Content-Type: application/json

{
  "message": "Texto del SMS",
  "tpoa": "OXYGENDL",
  "recipient": [{ "msisdn": "523312345678" }]
}
```

Éxito: `"code": "0"`.

## 5. Prioridad de envío (GDL)

```
LabsMobile (LABSMOBILE_*)
  ↓ si no
SMS Masivos / 402T (alternativas)
  ↓ si no
WhatsApp (WHATSAPP_*)
  ↓ si no
solo correo
```

## 6. Costo orientativo

LabsMobile publica precios por volumen en su web (~$0.22–0.30 MXN/SMS a volúmenes medios). Compara en el panel antes de comprar créditos.

| Concepto | Referencia |
|----------|------------|
| Cuenta DEMO | ~10 SMS gratis |
| Twilio → MX | ~$3.50 MXN/msg ❌ |
| Solo correo | $0 (ya activo) |

## 7. Diagnóstico

`GET /api/health/notify` → `smsMxProvider: "labsmobile"`, `smsMxPartial.labsmobile`
