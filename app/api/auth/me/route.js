import { NextResponse } from 'next/server';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';

export async function GET(request) {
  const user = readStaffSessionFromRequest(request);
  if (!user) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user });
}
