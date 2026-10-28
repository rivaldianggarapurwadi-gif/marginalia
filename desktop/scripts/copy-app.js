// Copies the web app (index.html, vendor/, icons/ and the manifest) into desktop/app so Electron can bundle it.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, '..', 'app');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'vendor'), path.join(out, 'vendor'), { recursive: true });
fs.cpSync(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });
fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
console.log('Copied web app into desktop/app');
