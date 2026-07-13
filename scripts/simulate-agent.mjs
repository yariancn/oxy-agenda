#!/usr/bin/env node
/**
 * Pruebas del agente staff (sin BD, sin modificar app existente).
 * node scripts/simulate-agent.mjs
 */

import assert from 'node:assert/strict';
import {
  handleAgentMessage,
  getAgentCapabilitiesForUser,
  runDesignAudit,
  AGENT_TOOL_IDS,
  ROLE_LEVEL,
} from '../lib/agent/index.js';
import { CLINIC_OXYGENDGL } from '../lib/clinicRegistry.js';

let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const masterUser = {
  id: 'admin',
  name: 'ADMINISTRADOR SUPREMO',
  role: 'Super Administrador Supremo',
  accessLevel: 1,
  allowedClinics: ['Oxygengdl', 'Shenandoah'],
};

const basicStaff = {
  id: '42',
  name: 'Recepción GDL',
  role: 'Recepcionista',
  accessLevel: 3,
  homeClinic: CLINIC_OXYGENDGL,
  allowedClinics: [CLINIC_OXYGENDGL],
  clinicProfiles: { [CLINIC_OXYGENDGL]: { name: 'Recepción GDL', role: 'Recepcionista' } },
};

const dbRoles = [
  { name: 'Recepcionista', level: 3 },
  { name: 'Administrador', level: 2 },
  { name: 'Super Administrador Maestro', level: 1 },
];

console.log('\nSimulación agente staff\n');

await test('sin sesión → denegado', async () => {
  const res = await handleAgentMessage({ message: 'reporte de ventas' });
  assert.equal(res.ok, false);
  assert.equal(res.denied, true);
});

await test('staff básico pide ventas → denegado', async () => {
  const res = await handleAgentMessage({
    user: basicStaff,
    dbRoles,
    activeClinic: CLINIC_OXYGENDGL,
    message: 'dame el reporte de ventas de hoy',
  });
  assert.equal(res.ok, false);
  assert.equal(res.denied, true);
  assert.equal(res.toolId, AGENT_TOOL_IDS.VIEW_SALES_REPORT);
});

await test('maestro pide auditoría → hallazgos críticos', async () => {
  const res = await handleAgentMessage({
    user: masterUser,
    message: 'corre auditoría de diseño del sistema',
  });
  assert.equal(res.ok, true);
  assert.equal(res.toolId, AGENT_TOOL_IDS.RUN_DESIGN_AUDIT);
  assert.ok(res.data.total >= 5);
  assert.ok(res.adminAlert?.shouldNotify);
});

await test('staff básico no recibe alerta de diseño en sesión normal', async () => {
  const res = await handleAgentMessage({
    user: basicStaff,
    dbRoles,
    activeClinic: CLINIC_OXYGENDGL,
    message: 'ver agenda de hoy',
  });
  assert.equal(res.adminAlert, undefined);
});

await test('facultades: básico sin ventas ni admin maestro', async () => {
  const caps = await getAgentCapabilitiesForUser({
    user: basicStaff,
    dbRoles,
    activeClinic: CLINIC_OXYGENDGL,
  });
  assert.equal(caps.roleLevel, ROLE_LEVEL.STAFF);
  const ids = caps.faculties.map((f) => f.id);
  assert.ok(!ids.includes(AGENT_TOOL_IDS.VIEW_SALES_REPORT));
  assert.ok(!ids.includes(AGENT_TOOL_IDS.MANAGE_STAFF));
  assert.ok(ids.includes(AGENT_TOOL_IDS.BOOK_APPOINTMENT));
});

await test('facultades: maestro incluye auditoría y staff', async () => {
  const caps = await getAgentCapabilitiesForUser({ user: masterUser });
  const ids = caps.faculties.map((f) => f.id);
  assert.ok(ids.includes(AGENT_TOOL_IDS.RUN_DESIGN_AUDIT));
  assert.ok(ids.includes(AGENT_TOOL_IDS.MANAGE_STAFF));
  assert.ok(ids.includes(AGENT_TOOL_IDS.VIEW_SALES_REPORT));
});

await test('design audit detecta hueco en /api/staff/db', async () => {
  const audit = runDesignAudit();
  const hit = audit.findings.find((f) => f.id === 'staff_db_clinic_only');
  assert.ok(hit);
  assert.equal(audit.healthy, false);
});

console.log(`\n${passed} pruebas OK\n`);
if (process.exitCode) process.exit(process.exitCode);
