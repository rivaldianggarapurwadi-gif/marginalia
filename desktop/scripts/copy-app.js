// Copies the web app (index.html + vendor/) into desktop/app so Electron can bundle it.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, '..', 'app');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'vendor'), path.join(out, 'vendor'), { recursive: true });
console.log('Copied web app into desktop/app');
