function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildGoogleMapsUrl(address) {
  const query = String(address || '').trim();
  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function normalizeMapsUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(maps\.google|www\.google\.com\/maps|goo\.gl\/maps)/i.test(value)) {
    return value.startsWith('http') ? value : `https://${value}`;
  }
  if (value.startsWith('www.')) return `https://${value}`;
  return '';
}

export function resolveClinicLocation({ address = '', mapsUrl = '' } = {}) {
  const addressText = String(address || '').trim();
  const explicitUrl = normalizeMapsUrl(mapsUrl);
  const mapsLink = explicitUrl || buildGoogleMapsUrl(addressText);

  return {
    address: addressText,
    mapsUrl: mapsLink,
    hasLocation: Boolean(addressText || mapsLink),
  };
}

export function formatLocationForSms({ address = '', mapsUrl = '', locale = 'es' } = {}) {
  const addressText = String(address || '').trim();
  // Solo usamos una liga corta provista por la clínica (p. ej. maps.app.goo.gl).
  // Evitamos la URL auto-generada de Google Maps porque es muy larga e infla el SMS.
  const explicitUrl = normalizeMapsUrl(mapsUrl);
  if (!addressText && !explicitUrl) return '';

  const es = locale !== 'en';
  const label = es ? 'Ubicación' : 'Location';

  if (explicitUrl) {
    return addressText
      ? `${label}: ${addressText} ${explicitUrl}`
      : `${label}: ${explicitUrl}`;
  }
  return `${label}: ${addressText}`;
}

export function formatLocationForEmailHtml({ address = '', mapsUrl = '', label = 'Location', locale = 'en' } = {}) {
  const location = resolveClinicLocation({ address, mapsUrl });
  if (!location.hasLocation) return '';

  const es = locale !== 'en';
  const link = location.mapsUrl;
  const linkText = location.address
    || (es ? 'Ver ubicación en Google Maps' : 'Open location in Google Maps');

  if (!link) {
    return `<p style="margin: 5px 0;"><strong>📍 ${escapeHtml(label)}:</strong> ${escapeHtml(location.address)}</p>`;
  }

  return `<p style="margin: 5px 0;"><strong>📍 ${escapeHtml(label)}:</strong> <a href="${escapeHtml(link)}" style="color:#2563eb;font-weight:700;text-decoration:underline;">${escapeHtml(linkText)}</a></p>`;
}

export function buildLocationTemplateVars({ address = '', mapsUrl = '' } = {}) {
  const location = resolveClinicLocation({ address, mapsUrl });
  const linkText = location.address && location.mapsUrl
    ? `${location.address} ${location.mapsUrl}`
    : (location.mapsUrl || location.address);

  return {
    direccion: location.address,
    address: location.address,
    ubicacion_link: location.mapsUrl,
    location_link: location.mapsUrl,
    direccion_link: linkText,
    location_with_link: linkText,
  };
}
