# App iPad — impresión Bluetooth (sin romper AirPrint)

La agenda en **Safari / Chrome / PC** sigue imprimiendo igual (diálogo del sistema / AirPrint).

La **app nativa iPad** (Capacitor) puede mandar tickets por **Bluetooth BLE** a térmicas tipo GOOJPRT cuando eliges la impresora en Admin.

## Requisitos

- Mac con **Xcode**
- Cuenta Apple Developer (para instalar en el iPad de la clínica)
- Impresora térmica con **Bluetooth Low Energy (BLE)** compatible con iOS  
  - Firefly / Bluetooth “clásico” SPP **no** sirve en iPad (límite de Apple)  
  - Si la GOOJPRT tiene modo “para iOS / Apple”, úsalo

## Una vez (en esta carpeta del repo)

```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

En Xcode:

1. Signing & Capabilities → tu Team
2. Añade permisos en `Info.plist` si no están:
   - `NSBluetoothAlwaysUsageDescription` = `Oxy Agenda usa Bluetooth para imprimir tickets en la térmica.`
   - `NSBluetoothPeripheralUsageDescription` = mismo texto
3. Conecta el iPad → Run

La app abre `https://oxy-agenda.vercel.app` (misma agenda en vivo).

## En el iPad (app nativa)

1. Admin → General → **Impresora Bluetooth (app iPad)**
2. **Buscar impresoras BT** → elige la térmica → queda guardada
3. Al imprimir ticket / corte / arqueo: intenta BT; si falla, usa el diálogo normal

## Actualizar la app

Los cambios de la agenda (tickets, SMS, etc.) salen con el **deploy de Vercel**.  
Solo vuelve a compilar la app iPad si cambias el shell Capacitor o permisos.

```bash
npx cap sync ios
npx cap open ios
```

## Nota sobre Firefly

Si la báscula usa un adaptador Firefly (serie Bluetooth clásico), **esa misma conexión no se puede reutilizar en iPad** para imprimir desde una app. La térmica debe hablar **BLE** (o Wi‑Fi / AirPrint).
