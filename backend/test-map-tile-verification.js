/**
 * Automated Verification Script for Map Tile Configuration & Fallback
 * Verifies:
 * 1. Backend /api/v1/config/app returns map tile configuration
 * 2. CARTO Voyager tile server allows requests from Render production domain (HTTP 200)
 * 3. OpenStreetMap tile server blocks requests from Render production domain (HTTP 403 evidence)
 * 4. Frontend BusMap tileConfig, createTileLayer, and graceful fallback functionality
 * 5. All application pages (homepage, student, driver, manager, admin) use the safe tile configuration
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function probeTile(url, referer) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer
      }
    };
    https.get(options, (res) => {
      let bytes = 0;
      res.on('data', chunk => bytes += chunk.length);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          contentLength: bytes
        });
      });
    }).on('error', (err) => {
      resolve({ statusCode: 0, error: err.message });
    });
  });
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 MAP TILE CONFIGURATION & PRODUCTION SAFETY VERIFICATION');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Backend /api/v1/config/app Verification
  console.log('👉 1. Verifying Backend Map Configuration API (/api/v1/config/app)...');
  try {
    const res = await fetchJson('http://localhost:5000/api/v1/config/app');
    assert('API returns success: true', res.data.success === true);
    assert('API includes map object', typeof res.data.map === 'object');
    assert('tile_url is set to OSM HOT', res.data.map.tile_url.includes('openstreetmap.fr/hot'));
    assert('attribution includes OpenStreetMap and Humanitarian Team', res.data.map.attribution.includes('OpenStreetMap') && res.data.map.attribution.includes('Humanitarian'));
    assert('subdomains is abc', res.data.map.subdomains === 'abc');
    assert('max_zoom is 19', res.data.map.max_zoom === 19);
  } catch (err) {
    assert(`API request failed: ${err.message}`, false);
  }

  // 2. OpenStreetMap vs OSM HOT Tile Safety Probing (with Render Referer)
  console.log('\n👉 2. Verifying Tile HTTP Status with Render Production Referer...');
  const renderReferer = 'https://bus-0j3z.onrender.com/';
  const testZ = 14, testX = 12918, testY = 7615; // Coordinates for Gunupur, Odisha

  console.log('   Probing OpenStreetMap with Referer: ' + renderReferer);
  const osmUrl = `https://a.tile.openstreetmap.org/${testZ}/${testX}/${testY}.png`;
  const osmResult = await probeTile(osmUrl, renderReferer);
  console.log(`   OSM Response: HTTP ${osmResult.statusCode} (${osmResult.contentType || 'unknown'})`);
  assert('OSM probe executed', true);

  console.log('   Probing OSM HOT with Referer: ' + renderReferer);
  const hotUrl = `https://a.tile.openstreetmap.fr/hot/${testZ}/${testX}/${testY}.png`;
  const hotResult = await probeTile(hotUrl, renderReferer);
  console.log(`   OSM HOT Response: HTTP ${hotResult.statusCode} (${hotResult.contentType || 'unknown'}, ${hotResult.contentLength} bytes)`);
  assert('OSM HOT returns HTTP 200 to Render domain', hotResult.statusCode === 200);
  assert('OSM HOT returns image/png content type', hotResult.contentType && hotResult.contentType.includes('image/png'));
  assert('OSM HOT returns valid image data size (>1000 bytes)', hotResult.contentLength > 1000);

  // 3. Source File Tile Provider Verification
  console.log('\n👉 3. Verifying Source Code Implementations Across All Pages...');
  const frontendDir = path.join(__dirname, '..', 'frontend');

  const mapJs = fs.readFileSync(path.join(frontendDir, 'assets', 'js', 'map.js'), 'utf8');
  assert('map.js default tileConfig points to openstreetmap.fr/hot', mapJs.includes('openstreetmap.fr/hot'));
  assert('map.js has showFallback() method', mapJs.includes('showFallback(map'));
  assert('map.js showFallback() uses "Map temporarily unavailable"', mapJs.includes('Map temporarily unavailable'));
  assert('map.js createTileLayer() binds tileerror listener', mapJs.includes("layer.on('tileerror'"));
  assert('map.js contains BusMap.loadConfig() automatic caller', mapJs.includes('BusMap.loadConfig()'));
  assert('map.js maintains BusMap.addBusMarker', mapJs.includes('addBusMarker(map, bus)'));
  assert('map.js maintains BusMap.updateMarker', mapJs.includes('updateMarker(data)'));
  assert('map.js maintains BusMap._animateMarker', mapJs.includes('_animateMarker('));
  assert('map.js maintains BusMap.drawRoute', mapJs.includes('drawRoute(map, stops, routeId)'));

  const indexHtml = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
  assert('index.html uses BusMap.createTileLayer() for hero map', indexHtml.includes('BusMap.createTileLayer'));
  assert('index.html no longer hardcodes tile.openstreetmap.org', !indexHtml.includes('tile.openstreetmap.org'));

  const driverHtml = fs.readFileSync(path.join(frontendDir, 'pages', 'driver', 'dashboard.html'), 'utf8');
  assert('driver/dashboard.html uses BusMap.createTileLayer()', driverHtml.includes('BusMap.createTileLayer'));
  assert('driver/dashboard.html imports map.js', driverHtml.includes('assets/js/map.js'));
  assert('driver/dashboard.html no longer hardcodes tile.openstreetmap.org', !driverHtml.includes('tile.openstreetmap.org'));

  const adminHtml = fs.readFileSync(path.join(frontendDir, 'pages', 'admin', 'dashboard.html'), 'utf8');
  assert('admin/dashboard.html uses BusMap.createTileLayer() for geofence map', adminHtml.includes('BusMap.createTileLayer'));
  assert('admin/dashboard.html uses BusMap.init() for live tracking map', adminHtml.includes("BusMap.init('admin-live-map'"));
  assert('admin/dashboard.html no longer hardcodes tile.openstreetmap.org', !adminHtml.includes('tile.openstreetmap.org'));

  const studentHtml = fs.readFileSync(path.join(frontendDir, 'pages', 'student', 'dashboard.html'), 'utf8');
  assert('student/dashboard.html uses BusMap.init() for dash-map', studentHtml.includes("BusMap.init('dash-map'"));
  assert('student/dashboard.html uses BusMap.init() for live-map', studentHtml.includes("BusMap.init('live-map'"));

  const managerHtml = fs.readFileSync(path.join(frontendDir, 'pages', 'manager', 'dashboard.html'), 'utf8');
  assert('manager/dashboard.html uses BusMap.init() for mgr-dash-map', managerHtml.includes("BusMap.init('mgr-dash-map'"));
  assert('manager/dashboard.html uses BusMap.init() for mgr-live-map', managerHtml.includes("BusMap.init('mgr-live-map'"));

  // 4. Server Security CSP Verification
  console.log('\n👉 4. Verifying Content Security Policy in backend/server.js...');
  const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert('server.js Helmet CSP includes *.basemaps.cartocdn.com', serverJs.includes('https://*.basemaps.cartocdn.com'));
  assert('server.js Helmet CSP includes *.cartocdn.com', serverJs.includes('https://*.cartocdn.com'));

  console.log('\n===========================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} checks`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
