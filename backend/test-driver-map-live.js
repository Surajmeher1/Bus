/**
 * test-driver-map-live.js
 * Headless Chrome E2E test verifying driver map tiles render cleanly without watermarks or 403 errors.
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const jwtConfig = require('./config/jwt');

function makeToken(id, role, extra = {}) {
  return jwt.sign({ id, role, ...extra }, jwtConfig.secret, { expiresIn: '2h' });
}

const PORT = 5000;
const CHROME_PORT = 9224;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.pending.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 VERIFYING DRIVER MAP TILES VIA HEADLESS CHROME (CDP)');
  console.log('===========================================================\n');

  const profileDir = path.join(__dirname, '..', '.tmp_chrome_map_driver');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CHROME_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + profileDir
  ]);

  await new Promise(r => setTimeout(r, 1500));

  let cdp;
  try {
    const listData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${CHROME_PORT}/json/list`, res => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    const pageWsUrl = listData[0]?.webSocketDebuggerUrl;
    if (!pageWsUrl) throw new Error('No Chrome webSocketDebuggerUrl found');

    cdp = new CdpClient(pageWsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const driverToken = makeToken(3, 'driver', { email: 'rahul@driver.edu', full_name: 'Rahul Sharma', bus_id: 1 });

    // Navigate to login page first to prime localStorage with auth token
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/pages/auth/login.html` });
    await new Promise(r => setTimeout(r, 1000));

    await cdp.eval(`
      localStorage.setItem('sbt_token', '${driverToken}');
      localStorage.setItem('sbt_user', JSON.stringify({ id: 3, role: 'DRIVER', email: 'rahul@driver.edu', full_name: 'Rahul Sharma', bus_id: 1 }));
    `);

    // Now navigate to driver dashboard as authenticated driver
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/pages/driver/dashboard.html` });

    console.log('👉 Waiting 4 seconds for map tiles to load on Driver Dashboard...');
    await new Promise(r => setTimeout(r, 4000));


    // Check Leaflet map instance on driver page
    const mapEval = await cdp.eval(`
      (() => {
        const map = window.driverMap;
        const container = document.getElementById('driver-map');
        const tiles = Array.from(document.querySelectorAll('#driver-map img.leaflet-tile'));
        const fallbackBanner = document.querySelector('.map-fallback-banner');
        const mapPane = document.querySelector('#driver-map .leaflet-pane');
        return {
          href: window.location.href,
          title: document.title,
          hasMap: !!(window.driverMap || mapPane),
          hasContainer: !!container,
          tileCount: tiles.length,
          tileUrls: tiles.map(t => t.src).slice(0, 5),
          fallbackBannerVisible: !!fallbackBanner
        };
      })()
    `);

    console.log('\n📊 Driver Map DOM Evaluation:', mapEval);

    let passed = 0;
    let failed = 0;
    function check(desc, cond) {
      if (cond) {
        console.log(`  ✅ PASS: ${desc}`);
        passed++;
      } else {
        console.error(`  ❌ FAIL: ${desc}`);
        failed++;
      }
    }

    check('driverMap Leaflet instance is initialized', mapEval.hasMap);
    check('Map container exists', mapEval.hasContainer);
    check('Map has rendered tiles (tileCount > 0)', mapEval.tileCount > 0);
    check('No fallback banner is displayed', mapEval.fallbackBannerVisible === false);
    check('Tile URL is NOT watermarked cartocdn', mapEval.tileUrls.length > 0 && !mapEval.tileUrls[0].includes('basemaps.cartocdn.com'));
    check('Tile URL is openstreetmap.fr/hot', mapEval.tileUrls.length > 0 && mapEval.tileUrls[0].includes('openstreetmap.fr/hot'));

    console.log('\n===========================================================');
    console.log(`📊 FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log('===========================================================');

    if (failed > 0) process.exit(1);

  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

run().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
