import { NextResponse } from 'next/server';
import {
  buildTrustedDeviceHint,
  readStaffDeviceFromRequest,
} from '../../../../lib/staffDeviceTrust.js';

export async function GET(request) {
  try {
    const device = readStaffDeviceFromRequest(request);
    if (!device?.email) {
      return NextResponse.json({ trusted: false });
    }
    return NextResponse.json(buildTrustedDeviceHint(device.email, device));
  } catch {
    return NextResponse.json({ trusted: false });
  }
}
