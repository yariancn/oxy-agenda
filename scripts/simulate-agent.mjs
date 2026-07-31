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
import { extractPatientSearchQuery } from '../lib/agent/parseParams.js';
import { classifyAgentIntent } from '../lib/agent/intents.js';
import { foldAgentText, fuzzyMatchToken, stripPatientSearchPrefix } from '../lib/agent/textUnderstand.js';
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

await test('maestro no recibe banner de auditoría al buscar paciente', async () => {
  const mockServices = {
    clinic: CLINIC_OXYGENDGL,
    listPatients: async ({ search }) => {
      assert.equal(search, 'brenda flores');
      return [{ patient: 'BRENDA FLORES', phone: '+52 3314108510', is_blocked: false }];
    },
  };
  const res = await handleAgentMessage({
    user: masterUser,
    dbRoles,
    activeClinic: CLINIC_OXYGENDGL,
    message: 'buscar pacientes brenda flores',
    services: mockServices,
  });
  assert.equal(res.ok, true);
  assert.equal(res.toolId, AGENT_TOOL_IDS.SEARCH_PATIENT);
  assert.match(res.reply, /BRENDA FLORES/i);
  assert.equal(res.adminAlert, undefined);
});

await test('extractPatientSearchQuery: plural pacientes', () => {
  assert.equal(extractPatientSearchQuery('buscar pacientes brenda flores'), 'brenda flores');
  assert.equal(extractPatientSearchQuery('buscar paciente García'), 'garcia');
});

await test('comprensión: typos y mayúsculas en búsqueda', () => {
  assert.equal(extractPatientSearchQuery('BUSCAR PACINETE brenda flores'), 'brenda flores');
  assert.equal(extractPatientSearchQuery('busacr pacientes brenda flores'), 'brenda flores');
  assert.equal(extractPatientSearchQuery('brenda flores'), 'brenda flores');
  const intent = classifyAgentIntent('busacr pacinete brenda flores');
  assert.equal(intent.toolId, AGENT_TOOL_IDS.SEARCH_PATIENT);
});

await test('comprensión: agenda con typos', () => {
  assert.equal(classifyAgentIntent('ver agemda de hoy').toolId, AGENT_TOOL_IDS.VIEW_TODAY_SCHEDULE);
  assert.equal(classifyAgentIntent('CITAS DE HOY').toolId, AGENT_TOOL_IDS.VIEW_TODAY_SCHEDULE);
});

await test('comprensión: sin acentos', () => {
  assert.equal(foldAgentText('García Pérez'), 'garcia perez');
  assert.ok(fuzzyMatchToken('pacinete', ['paciente', 'pacientes']));
  assert.equal(stripPatientSearchPrefix('buscar paciente garcia'), 'garcia');
});

await test('typos: maestro busca con errores ortográficos', async () => {
  const mockServices = {
    clinic: CLINIC_OXYGENDGL,
    listPatients: async ({ search }) => {
      assert.equal(search, 'brenda flores');
      return [{ patient: 'BRENDA FLORES', phone: '+52 3314108510', is_blocked: false }];
    },
  };
  const res = await handleAgentMessage({
    user: masterUser,
    dbRoles,
    activeClinic: CLINIC_OXYGENDGL,
    message: 'busacr pacinete brenda flores',
    services: mockServices,
  });
  assert.equal(res.ok, true);
  assert.equal(res.toolId, AGENT_TOOL_IDS.SEARCH_PATIENT);
  assert.match(res.reply, /BRENDA FLORES/i);
});

await test('ayuda: como cobrar a un cliente', async () => {
  const res = await handleAgentMessage({
    user: basicStaff,
    dbRoles,
    activeClinic: CLINIC_OXYGENDGL,
    message: 'como puedo cobrar a un cliente?',
  });
  assert.equal(res.ok, true);
  assert.equal(res.toolId, AGENT_TOOL_IDS.HELP_GUIDE);
  assert.match(res.reply, /Expediente/i);
  assert.match(res.reply, /Cobrar y generar ticket/i);
});

await test('ayuda: no encuentro paciente', async () => {
  const mockServices = {
    clinic: CLINIC_OXYGENDGL,
    listPatients: async () => [],
  };
  const res = await handleAgentMessage({
    user: basicStaff,
    dbRoles,
    activeClinic: CLINIC_OXYGENDGL,
    message: 'buscar paciente xyz inexistente',
    services: mockServices,
  });
  assert.equal(res.ok, true);
  assert.match(res.reply, /No encontré pacientes/i);
  assert.match(res.reply, /cómo cobro/i);
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
