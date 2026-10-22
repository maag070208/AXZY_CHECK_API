#!/usr/bin/env node
/**
 * Sube la versión del CONTRATO de la API.
 * Uso: npm run api:version -- patch "descripción del cambio"
 *      npm run api:version -- minor "nueva capacidad"
 *      npm run api:version -- major "cambio incompatible"
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const type = process.argv[2];
const message = process.argv.slice(3).join(' ').trim();
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('Uso: npm run api:version -- patch|minor|major "descripción"');
  process.exit(1);
}

const versionFile = path.join(root, 'src/core/constants/api-version.ts');
const packageFile = path.join(root, 'package.json');
const versionSource = fs.readFileSync(versionFile, 'utf8');
const match = versionSource.match(/export const API_VERSION = "(\d+)\.(\d+)\.(\d+)";/);
if (!match) {
  console.error('No se encontró API_VERSION en api-version.ts');
  process.exit(1);
}

let [major, minor, patch] = match.slice(1).map(Number);
if (type === 'major') { major += 1; minor = 0; patch = 0; }
else if (type === 'minor') { minor += 1; patch = 0; }
else { patch += 1; }
const next = `${major}.${minor}.${patch}`;

fs.writeFileSync(
  versionFile,
  versionSource.replace(match[0], `export const API_VERSION = "${next}";`),
);

const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
pkg.version = next;
fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');

const changelog = path.join(root, 'API_CHANGELOG.md');
const line = `| ${new Date().toISOString().slice(0, 10)} | ${next} | ${type} | ${message || 'Sin descripción'} |\n`;
if (!fs.existsSync(changelog)) {
  fs.writeFileSync(changelog, '# API Changelog\n\n| Fecha | Versión | Tipo | Cambio |\n|---|---|---|---|\n');
}
fs.appendFileSync(changelog, line);
console.log(`API_VERSION actualizada a ${next}`);
