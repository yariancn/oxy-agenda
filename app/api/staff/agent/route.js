import { NextResponse } from 'next/server';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { refreshStaffSessionUser } from '../../../../lib/resolveStaffLoginServer.js';
import { normalizeStaffSessionUser } from '../../../../lib/clinicAccess.js';
import {
  createAgentServices,
  getAgentCapabilitiesForUser,
  handleAgentMessage,
} from '../../../../lib/agent/index.js';

async function resolveSessionUser(request) {
  let user = readStaffSessionFromRequest(request);
  if (!user) return null;
  try {
    user = await refreshStaffSessionUser(user);
    user = normalizeStaffSessionUser(user, { roleLevel: user?.accessLevel });
  } catch {
    user = normalizeStaffSessionUser(user, { roleLevel: user?.accessLevel });
  }
  return user;
}

export async function GET(request) {
  try {
    const user = await resolveSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const activeClinic = searchParams.get('clinic') || user.homeClinic;
    const locale = searchParams.get('locale') || 'es';

    const services = createAgentServices(activeClinic);
    const dbRoles = await services.fetchDbRoles();

    const caps = await getAgentCapabilitiesForUser({
      user,
      dbRoles,
      activeClinic,
      locale,
    });

    return NextResponse.json({ capabilities: caps });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await resolveSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const message = String(body.message || '').trim();
    const activeClinic = body.activeClinic || user.homeClinic;
    const locale = body.locale || 'es';

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const services = createAgentServices(activeClinic);
    const dbRoles = await services.fetchDbRoles();

    const result = await handleAgentMessage({
      user,
      dbRoles,
      activeClinic,
      message,
      locale,
      services,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
