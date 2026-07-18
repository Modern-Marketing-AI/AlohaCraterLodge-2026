#!/usr/bin/env node
/**
 * check-footer.js
 * Verifies that every public HTML page in the project root includes the shared
 * site footer: <div id="site-footer"></div> + <script src="footer.js"></script>
 *
 * Run:  node scripts/check-footer.js
 * Exit: 0 = all pages OK, 1 = one or more pages missing the footer
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const ALLOWLIST = new Set([
  'guest-intel.html',
  'admin/index.html',
  'google796dad6550453455.html',
]);

const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

let failed = false;

for (const file of htmlFiles) {
  if (ALLOWLIST.has(file)) {
    console.log(`SKIP : ${file} (excluded)`);
    continue;
  }

  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const hasDiv    = content.includes('id="site-footer"');
  const hasScript = content.includes('src="footer.js"');

  if (hasDiv && hasScript) {
    console.log(`OK   : ${file}`);
  } else {
    const missing = [];
    if (!hasDiv)    missing.push('<div id="site-footer">');
    if (!hasScript) missing.push('<script src="footer.js">');
    console.error(`FAIL : ${file} — missing: ${missing.join(', ')}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nFooter check failed. Add the footer snippet before </body> in each failing file.');
  process.exit(1);
} else {
  console.log('\nAll public pages have the site footer.');
  process.exit(0);
}
