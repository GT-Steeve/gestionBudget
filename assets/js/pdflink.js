/* ==========================================================================
   Gestion budget — données du profil dans un PDF (partagé navigateur +
   Node/tests). Le PDF est produit par la fenêtre d'impression du navigateur :
   on ne peut rien y écrire directement, mais les liens du rapport y sont
   conservés tels quels. Le lien « Gestion budget » de la page de garde porte
   donc les données après le # (jamais envoyé au site si on clique dessus) :
   #gb1.<JSON en base64url>.<CRC-32 en hexadécimal>, relu par readData.
   ========================================================================== */
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./docx.js'));
  else if (root) root.PdfLink = factory(root.Docx);
})(typeof window !== 'undefined' ? window : globalThis, function (Docx) {
  const SITE = 'https://gt-steeve.github.io/gestionBudget/pages/profil.html';
  const PATTERN = /#gb1\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})/g;

  const toBase64Url = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const hex8 = (n) => n.toString(16).padStart(8, '0');

  /** Lien du rapport portant les données (objet JSON). */
  function url(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    return `${SITE}#gb1.${toBase64Url(bytes)}.${hex8(Docx.crc32(bytes))}`;
  }

  /** Données d'un lien #gb1 trouvé dans ce texte, ou null. Les liens sont
      cherchés en clair et sous forme hexadécimale (/URI <…>), selon le
      navigateur qui a produit le PDF. */
  function findData(text) {
    const latin1 = new TextDecoder('latin1');
    const hexUris = [...text.matchAll(/\/URI\s*<([0-9A-Fa-f\s]+)>/g)].map(([, h]) =>
      latin1.decode(Uint8Array.from(h.replace(/\s+/g, '').match(/../g) || [], (b) => parseInt(b, 16))));
    for (const source of [text, ...hexUris]) {
      for (const [, payload, crc] of source.matchAll(PATTERN)) {
        try {
          const json = fromBase64Url(payload);
          if (hex8(Docx.crc32(json)) !== crc) continue;
          return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json));
        } catch { /* lien illisible : on essaie le suivant */ }
      }
    }
    return null;
  }

  // Limites de décompression, pour qu'un fichier piégé ne fige pas l'onglet :
  // taille par flux, taille cumulée de tous les flux, nombre de flux lus.
  const MAX_INFLATED = 16 * 1024 * 1024;
  const MAX_INFLATED_TOTAL = 32 * 1024 * 1024;
  const MAX_STREAMS = 50;

  /** Flux FlateDecode décompressé : { text, size }, où text (latin1) vaut null
      si le flux est illisible ou dépasse limit octets, et size compte les
      octets décompressés, même pour un flux abandonné en cours de route. */
  async function inflate(bytes, limit) {
    const chunks = [];
    let size = 0;
    try {
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) { reader.cancel(); return { text: null, size }; }
        chunks.push(value);
      }
    } catch { return { text: null, size }; }
    const latin1 = new TextDecoder('latin1');
    return { text: chunks.map((c) => latin1.decode(c, { stream: true })).join('') + latin1.decode(), size };
  }

  /** Flux d'objets compressés (/Type /ObjStm) du PDF : certains générateurs y
      rangent les liens au lieu de les écrire en clair. */
  function objectStreams(text, bytes) {
    const streams = [];
    // Dictionnaire de l'objet (de « obj » jusqu'à « stream », sans franchir un endobj).
    for (const m of text.matchAll(/\bobj\s*<<((?:(?!endobj)[\s\S]){0,2000}?)>>\s*stream(\r\n|\n|\r)/g)) {
      const dict = m[1];
      if (!/\/Type\s*\/ObjStm\b/.test(dict) || !/\/FlateDecode\b/.test(dict)) continue;
      const start = m.index + m[0].length;
      // /Length direct si présent (pas une référence « 12 0 R »), sinon jusqu'à
      // endstream, sans le retour à la ligne qui le précède.
      const length = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
      let end = length ? start + Number(length[1]) : text.indexOf('endstream', start);
      if (end < start || end > bytes.length) continue;
      if (!length) end -= text.endsWith('\r\n', end) ? 2 : /[\r\n]/.test(text[end - 1]) ? 1 : 0;
      streams.push(bytes.subarray(start, end));
    }
    return streams;
  }

  /** Données portées par un lien du PDF (Promise), ou null. Un PDF qui n'en
      contient pas, un lien tronqué ou modifié (CRC-32 faux) est refusé. */
  async function readData(bytes) {
    // Le lien est en ASCII : le PDF est lu octet par octet (latin1), sans tenir compte de son encodage.
    const text = new TextDecoder('latin1').decode(bytes);
    if (!text.startsWith('%PDF-')) return null;
    const found = findData(text);
    if (found || typeof DecompressionStream !== 'function') return found;
    // Chaque flux lu, même abandonné, consomme le budget total : une fois
    // épuisé, la recherche s'arrête et le fichier est refusé.
    let budget = MAX_INFLATED_TOTAL;
    for (const stream of objectStreams(text, bytes).slice(0, MAX_STREAMS)) {
      if (budget <= 0) break;
      const { text: inflated, size } = await inflate(stream, Math.min(MAX_INFLATED, budget));
      budget -= size;
      const data = inflated && findData(inflated);
      if (data) return data;
    }
    return null;
  }

  return { url, readData };
});
