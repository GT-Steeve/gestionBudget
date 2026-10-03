#!/usr/bin/env node
/* eslint-env node */
/**
 * "Build" pour un site statique sans bundler : vérifie que chaque page HTML
 * référence des fichiers locaux (css/js/img) qui existent bien sur disque,
 * pour attraper un lien cassé avant le déploiement, et que le numéro de
 * cache ?v= des CSS/JS a bien été augmenté quand ces fichiers ont changé.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { root, listHtmlFiles, computeAssetsHash, readManifest, versionPattern } from './asset-version.mjs';

const htmlFiles = listHtmlFiles();

if (htmlFiles.length === 0) {
  console.error('Aucune page HTML trouvée.');
  process.exit(1);
}

const attrPattern = /(?:src|href)="([^"]+)"/g;
let missing = 0;
let versionErrors = 0;
const manifest = readManifest();

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

  for (const [, v] of html.matchAll(versionPattern)) {
    if (v !== manifest.version) {
      console.error(`✖ ${rel} charge un CSS/JS avec ?v=${v} au lieu de ?v=${manifest.version} (scripts/asset-version.json).`);
      versionErrors++;
    }
  }
}

if (computeAssetsHash() !== manifest.hash) {
  console.error(
    `✖ Les fichiers CSS/JS ont changé, mais le numéro de cache ?v=${manifest.version} n'a pas été augmenté :\n` +
    '  les navigateurs garderaient l\'ancienne version en cache. Lancez `npm run bump-assets`.'
  );
  versionErrors++;
}

if (missing > 0) {
  console.error(`\n${missing} référence(s) cassée(s).`);
  process.exit(1);
}

if (versionErrors > 0) {
  console.error(`\n${versionErrors} problème(s) de version de cache des CSS/JS.`);
  process.exit(1);
}

console.log(`✓ ${htmlFiles.length} page(s) HTML vérifiée(s), toutes les références locales existent.`);
console.log(`✓ Version de cache des CSS/JS à jour (?v=${manifest.version}).`);
