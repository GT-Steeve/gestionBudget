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

  /** Données portées par un lien du PDF, ou null. Un PDF qui n'en contient
      pas, un lien tronqué ou modifié (CRC-32 faux) est refusé. Les liens sont
      cherchés en clair et sous forme hexadécimale (/URI <…>), selon le
      navigateur qui a produit le PDF. */
  function readData(bytes) {
    const text = new TextDecoder('latin1').decode(bytes);
    // Le lien est en ASCII : le PDF est lu octet par octet (latin1), sans tenir compte de son encodage.
    if (!text.startsWith('%PDF-')) return null;
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

  return { url, readData };
});
