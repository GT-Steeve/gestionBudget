/* eslint-env node */
/**
 * Version de cache des CSS/JS : les pages chargent les assets avec ?v=X.
 * Si un fichier CSS/JS change sans que X augmente, les navigateurs gardent
 * l'ancien fichier en cache. scripts/asset-version.json mémorise X et une empreinte
 * des fichiers concernés, pour que le build détecte un oubli.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const manifestPath = join(root, 'scripts', 'asset-version.json');

/** Pages HTML du site (racine + pages/). */
export function listHtmlFiles() {
  return [
    ...readdirSync(root).filter((f) => f.endsWith('.html')),
    ...readdirSync(join(root, 'pages')).filter((f) => f.endsWith('.html')).map((f) => join('pages', f)),
  ];
}

/** Fichiers servis avec ?v= : assets/css/*.css et assets/js/*.js (hors tests). */
function listVersionedAssets() {
  const css = readdirSync(join(root, 'assets', 'css')).filter((f) => f.endsWith('.css')).map((f) => join('assets', 'css', f));
  const js = readdirSync(join(root, 'assets', 'js'))
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => join('assets', 'js', f));
  return [...css, ...js].sort();
}

/** Empreinte SHA-256 du contenu des assets (fins de ligne normalisées). */
export function computeAssetsHash() {
  const hash = createHash('sha256');
  for (const rel of listVersionedAssets()) {
    hash.update(rel.split('\\').join('/'));
    hash.update('\0');
    hash.update(readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function readManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

/** Valeurs ?v= trouvées dans une page, pour les liens vers assets/css et assets/js. */
export const versionPattern = /assets\/(?:css|js)\/[\w.-]+\.(?:css|js)\?v=([\w.-]+)/g;
