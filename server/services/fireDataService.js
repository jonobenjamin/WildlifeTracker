/**
 * Fetches fire data from NASA FIRMS for the KPR concession bbox,
 * then keeps only points that fall inside the concession polygon.
 */
const { getConcessionFirmsBbox, filterFiresInConcession } = require('./concessionBoundary');

async function fetchFireData(days = 3) {
  const daysParam = Math.min(parseInt(days, 10) || 3, 7);
  const bbox = getConcessionFirmsBbox();
  const BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
  const mapKey = (process.env.FIRMS_MAP_KEY || '').trim().replace(/^["']|["']$/g, '');

  if (!mapKey) {
    throw new Error('FIRMS_MAP_KEY environment variable not set');
  }

  function csvToGeoJSON(csvText) {
    const text = String(csvText || '').trim();
    if (!text || text.startsWith('<!DOCTYPE')) throw new Error('FIRMS returned HTML instead of CSV');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { type: 'FeatureCollection', features: [] };
    const headers = lines[0].split(',').map((h) => h.trim());
    const features = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length < headers.length) continue;
      const properties = {};
      headers.forEach((header, index) => {
        properties[header] = (values[index] || '').trim();
      });
      const lat = parseFloat(properties.latitude);
      const lng = parseFloat(properties.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { ...properties, sensor: properties.instrument || 'Unknown' },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  const products = [
    ['VIIRS_SNPP_NRT', 'VIIRS'],
    ['VIIRS_NOAA20_NRT', 'VIIRS'],
    ['MODIS_NRT', 'MODIS'],
  ];
  const all = [];
  for (const [product, sensor] of products) {
    const url = `${BASE_URL}/${mapKey}/${product}/${bbox}/${daysParam}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const text = await res.text();
    try {
      const data = csvToGeoJSON(text);
      all.push(
        ...(data.features || []).map((f) => ({
          ...f,
          properties: { ...f.properties, sensor },
        }))
      );
    } catch {
      // skip bad product response
    }
  }

  return filterFiresInConcession(all);
}

module.exports = { fetchFireData };
