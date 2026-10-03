const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'rainclass-autofill.user.js'), 'utf8');
const block = script.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0];
assert.ok(block, 'Userscript metadata is missing.');
const metadata = block.replace(/\r\n/g, '\n') + '\n';
const target = path.join(root, 'rainclass-autofill.meta.js');
if (process.argv.includes('--write')) fs.writeFileSync(target, metadata);
else assert.equal(fs.readFileSync(target, 'utf8'), metadata, 'Run npm run sync-meta after changing the header.');

const pkg = require('../package.json');
const api = require('../rainclass-autofill.user.js');
assert.equal(block.match(/^\/\/ @version\s+(\S+)/m)?.[1], pkg.version);
assert.equal(api.VERSION, pkg.version);
for (const tag of ['author', 'homepageURL', 'supportURL', 'updateURL', 'downloadURL', 'license']) {
  assert.ok(new RegExp('^// @' + tag + '\\s+.+', 'm').test(block), 'Missing metadata tag: ' + tag);
}
assert.ok(block.includes('https://raw.githubusercontent.com/hrx0908/rainclass-autofill/main/rainclass-autofill.user.js'));
console.log('Userscript syntax, version and update metadata are consistent.');
