const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
let server, browser;
(async () => {
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + decodeURIComponent(name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.gif':'image/gif'})[path.extname(file)] || 'text/plain');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({channel: process.env.TLC_BROWSER_CHANNEL || 'chromium', headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const page = await context.newPage(), errors = [], requests = [];
  context.on('request', req => requests.push(req.url()));
  page.on('pageerror', err => errors.push(err.message));
  await page.addInitScript(() => {
    window.configReads = 0;
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) { if (key === 'tlcp_config') window.configReads++; return get.call(this, key); };
  });
  const ready = async () => { await page.waitForFunction(() => !!S.heightMap); await page.waitForSelector('#splash', {state:'detached'}); };
  await page.goto(base); await ready();
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'First visit must not write storage');
  assert.equal(await page.evaluate(() => configReads), 0, 'No preference reads before opt-in');
  // Legacy preferences must also remain unread until a fresh choice.
  await page.evaluate(() => localStorage.setItem('tlcp_config', JSON.stringify({theme:'Classic'})));
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => configReads), 0);
  assert.equal(await page.evaluate(() => S.theme), 'Dark');
  await page.getByRole('button', {name:'Use without remembered settings',exact:true}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('tlcp_config')), null);
  assert.deepEqual(await context.cookies(), []);
  await page.evaluate(() => { S.theme = 'Classic'; applyTheme(); });
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => S.theme), 'Dark', 'Refused preferences must not survive reload');
  assert.equal(await page.locator('[data-storage-notice]').count(), 0, 'Refusal is remembered');
  await page.getByRole('button', {name:'Storage settings',exact:true}).click();
  await page.getByRole('button', {name:'Remember my settings',exact:true}).click();
  await page.evaluate(() => { S.theme = 'Classic'; applyTheme(); });
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => S.theme), 'Classic', 'Opted-in settings must persist');
  // Saving a track is an independent, explicit user request, and survives withdrawal.
  await page.evaluate(() => { polygon=[makeCoordinate(0,0,0,100,-1,1),makeCoordinate(1000,0,0,100,-1,1),makeCoordinate(500,1000,0,100,-1,1)]; displayChange(); });
  await page.evaluate(() => vaultSaveDialog());
  await page.getByRole('textbox', {name:'Track name',exact:true}).fill('Privacy regression track');
  await page.getByRole('button', {name:'Save Track',exact:true}).click();
  const saved = await page.evaluate(() => localStorage.getItem('tlcp_vault'));
  assert.ok(saved.includes('Privacy regression track'));
  const policy = await context.newPage(); await policy.goto(base + '/legal.html#storage');
  await policy.getByRole('button', {name:'Use without remembered settings',exact:true}).click();
  await page.waitForFunction(() => !TLCPrivacy.allowed());
  await page.evaluate(() => saveConfig());
  assert.equal(await page.evaluate(() => localStorage.getItem('tlcp_config')), null, 'Withdrawal in another tab must disable writes');
  assert.equal(await page.evaluate(() => localStorage.getItem('tlcp_vault')), saved, 'Withdrawal must preserve tracks');
  // Destructive storage controls require a separate explicit confirmation.
  policy.once('dialog', dialog => dialog.dismiss());
  await policy.getByRole('button', {name:'Delete all browser track saves…',exact:true}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('tlcp_vault')), saved);
  policy.once('dialog', dialog => dialog.accept());
  await policy.getByRole('button', {name:'Delete all browser track saves…',exact:true}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('tlcp_vault')), null);
  await page.evaluate(() => localStorage.setItem('tlcp_storage', JSON.stringify({version:1,preferences:true,expires:Date.now()-1})));
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => configReads), 0, 'Expired choice must not authorize preference reads');
  await page.getByRole('button', {name:'Use without remembered settings',exact:true}).click();
  // Tab navigation must not mutate geometry through the global arrow shortcuts.
  await page.locator('#btn-tab-geom').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#btn-tab-map').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#btn-tab-map').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('End'); assert.equal(await page.locator('[data-tab="decorations"]').getAttribute('aria-selected'), 'true');
  await page.locator('#mb-edit').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {name:'Track points — keyboard editor',exact:true});
  assert.equal(await dialog.count(), 1); assert.equal(await page.locator('#app').evaluate(el => el.inert), true);
  const first = dialog.locator('.modal-close'); await first.focus(); await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button', {name:'Append point',exact:true}).evaluate(el => el === document.activeElement), true, 'Modal must contain keyboard focus');
  for (const [axis,value] of [['X','300'],['Y','400'],['Z','5']]) await page.locator('[data-point-axis="'+axis+'"]').fill(value);
  const count = await page.evaluate(() => polygon.length);
  await page.getByRole('button', {name:'Append point',exact:true}).click();
  assert.equal(await page.evaluate(() => polygon.length), count + 1);
  await page.getByRole('button', {name:'Edit selected point',exact:true}).click();
  await page.getByRole('textbox', {name:'X (m):',exact:true}).fill('777');
  await page.getByRole('button', {name:'Apply Changes',exact:true}).click();
  assert.equal(await page.evaluate(() => polygon.at(-1).x), 777);
  assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Nested dialog restores parent focus');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
  assert.equal(await page.locator('#mb-edit').evaluate(el => el === document.activeElement), true);
  // Message-box Escape must settle the promise, and button results remain intact.
  await page.evaluate(() => { window.messageResult=null; messageBox('Test confirmation','Choose an option',['Cancel','Confirm']).then(value => window.messageResult=value); });
  await page.getByRole('button', {name:'Confirm',exact:true}).click();
  assert.equal(await page.evaluate(() => messageResult), 1);
  await page.evaluate(() => { window.messageResult=null; messageBox('Test escape','Close with Escape').then(value => window.messageResult=value); });
  await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => messageResult), -1);
  const names = await page.locator('.slider-row input').evaluateAll(inputs => inputs.every(input => input.getAttribute('aria-labelledby')));
  assert.equal(names, true);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button', {name:'Storage settings',exact:true}).click();
  const notice = await page.locator('[data-storage-notice]').boundingBox(); assert.ok(notice.x >= 0 && notice.x + notice.width <= 390);
  fs.mkdirSync(path.join(root,'test-results'), {recursive:true});
  await page.screenshot({path:path.join(root,'test-results/v1.3.4-mobile-storage.png')});
  await policy.setViewportSize({width:390,height:844});
  assert.equal(await policy.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Policy page must fit a mobile viewport');
  await policy.screenshot({path:path.join(root,'test-results/v1.3.4-policies.png'),fullPage:true});
  // Denied storage must not prevent a fresh editor from starting.
  const blocked = await browser.newPage();
  blocked.on('pageerror', err => errors.push(err.message));
  await blocked.addInitScript(() => { for (const key of ['getItem','setItem','removeItem']) Storage.prototype[key] = () => { throw new DOMException('Storage blocked','SecurityError'); }; });
  await blocked.goto(base); await blocked.waitForFunction(() => !!S.heightMap);
  await blocked.getByRole('button', {name:'Use without remembered settings',exact:true}).click();
  assert.equal(await blocked.evaluate(() => TLCPrivacy.allowed()), false);
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith(base + '/')), 'The editor and policies must not request third-party resources');
  console.log('PASS: no default/legacy preference access; consent, refusal, expiry, cross-tab withdrawal, independent saves and confirmed deletion; no cookies or third-party requests; keyboard tabs/menus/point editing; nested modal focus and Escape; mobile policies; blocked storage.');
})().catch(err => { console.error(err); process.exitCode=1; }).finally(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
