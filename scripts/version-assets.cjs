// Publish each commit with new script/stylesheet URLs so open browsers cannot
// reuse an older app revision after reloading an unchanged index page.
const fs = require('node:fs');
const file = process.argv[2] || '_site/index.html';
const revision = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/i.test(revision || '')) throw new Error('GITHUB_SHA must identify the deployment commit');
const html = fs.readFileSync(file, 'utf8');
const versioned = html.replace(/\b(href|src)="((?:css|js)\/[^"?#]+\.(?:css|js))(?:\?[^"#]*)?"/g,
  (_, attr, url) => `${attr}="${url}?v=${revision}"`);
if (versioned === html) throw new Error('No application assets found to version');
fs.writeFileSync(file, versioned);
console.log(`Versioned application assets for ${revision}`);
