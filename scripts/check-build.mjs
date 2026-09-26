#!/usr/bin/env node
/* eslint-env node */
/**
 * "Build" pour un site statique sans bundler : vérifie que chaque page HTML
 * référence des fichiers locaux (css/js/img) qui existent bien sur disque,
 * pour attraper un lien cassé avant le déploiement.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/** Liste manuelle (pas de fs.globSync, absent avant Node 22) des pages HTML du site. */
const htmlFiles = [
  ...readdirSync(root).filter((f) => f.endsWith('.html')),
  ...readdirSync(join(root, 'pages')).filter((f) => f.endsWith('.html')).map((f) => join('pages', f)),
];

if (htmlFiles.length === 0) {
  console.error('Aucune page HTML trouvée.');
  process.exit(1);
}

const attrPattern = /(?:src|href)="([^"]+)"/g;
let missing = 0;

for (const rel of htmlFiles) {
  const fullPath = join(root, rel);
  const html = readFileSync(fullPath, 'utf8');
  const pageDir = dirname(fullPath);

  for (const match of html.matchAll(attrPattern)) {
    const ref = match[1].split('?')[0].split('#')[0];
    if (!ref || /^(https?:)?\/\//.test(ref) || ref.startsWith('mailto:')) continue;
    const resolved = join(pageDir, ref);
    if (!existsSync(resolved)) {
      console.error(`✖ ${rel} référence un fichier introuvable : ${ref}`);
      missing++;
    }
  }
}

if (missing > 0) {
  console.error(`\n${missing} référence(s) cassée(s).`);
  process.exit(1);
}

console.log(`✓ ${htmlFiles.length} page(s) HTML vérifiée(s), toutes les références locales existent.`);
