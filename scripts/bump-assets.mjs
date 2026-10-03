#!/usr/bin/env node
/* eslint-env node */
/**
 * Augmente le numéro de cache ?v= des CSS/JS dans toutes les pages et met à
 * jour scripts/asset-version.json. À lancer après toute modification d'un fichier
 * CSS/JS : `npm run bump-assets`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, manifestPath, listHtmlFiles, computeAssetsHash, readManifest, versionPattern } from './asset-version.mjs';

const manifest = readManifest();
const hash = computeAssetsHash();

if (hash === manifest.hash && !process.argv.includes('--force')) {
  console.log(`Les CSS/JS n'ont pas changé : la version ${manifest.version} reste en place (--force pour l'augmenter quand même).`);
  process.exit(0);
}

const parts = manifest.version.split('.');
const last = parts.length - 1;
parts[last] = String(Number(parts[last]) + 1).padStart(parts[last].length, '0');
const next = parts.join('.');

for (const rel of listHtmlFiles()) {
  const file = join(root, rel);
  const html = readFileSync(file, 'utf8');
  const updated = html.replace(versionPattern, (m, v) => m.slice(0, -v.length) + next);
  if (updated !== html) writeFileSync(file, updated);
}

writeFileSync(manifestPath, `${JSON.stringify({ version: next, hash }, null, 2)}\n`);
console.log(`✓ Version des CSS/JS : ${manifest.version} → ${next}`);
