'use strict';
// Extract the exact original PNG bytes; no re-encoding or visual changes.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
let source = fs.readFileSync(path.join(root, 'assets/atlas-v1.3.5.js'), 'utf8');
const image = source.match(/const CITADEL_CAPTAIN_SHEET='data:image\/png;base64,([^']+)';/);
if (!image) throw Error('Original captain sheet not found');
fs.writeFileSync(path.join(root, 'assets/citadel-captain-sheet-v2.3.1.png'), Buffer.from(image[1], 'base64'));
source = source.replace(image[0], "const CITADEL_CAPTAIN_SHEET='./assets/citadel-captain-sheet-v2.3.1.png';");
source = source.replace('if(!globalThis.ATLAS_TEST)initialize();',
  "if(typeof globalThis.CITADEL_LAUNCH_INSTALL==='function')globalThis.CITADEL_LAUNCH_INSTALL();\nif(!globalThis.ATLAS_TEST)initialize();");
fs.writeFileSync(path.join(root, 'assets/atlas-v1.3.6.js'), source);
console.log(JSON.stringify({ coreBytes: Buffer.byteLength(source), extractedPngBytes: Buffer.from(image[1], 'base64').length }));
