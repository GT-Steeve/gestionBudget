import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
const PdfLink = require('./pdflink.js');

const data = { app: 'gestion-budget', nom: 'Élise « test »', data: { charges: [1, 2] } };
/** PDF minimal portant un lien, comme l'écrit la fenêtre d'impression du navigateur. */
const pdf = (uri) => new TextEncoder().encode(`%PDF-1.4\n1 0 obj\n<</Type /Annot /Subtype /Link /A <</S /URI /URI ${uri}>>>>\nendobj\n%%EOF`);
const hex = (s) => `<${[...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('')}>`;
const concat = (...parts) => {
  const bytes = parts.map((p) => (typeof p === 'string' ? new TextEncoder().encode(p) : p));
  const out = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
  bytes.reduce((pos, b) => { out.set(b, pos); return pos + b.length; }, 0);
  return out;
};
/** Objet PDF n contenant un flux d'objets compressé (/ObjStm). */
const objStm = (n, content, { withLength = true } = {}) => {
  const body = deflateSync(Buffer.from(content, 'latin1'));
  const length = withLength ? `/Length ${body.length} ` : '';
  return [`${n} 0 obj\n<</Type /ObjStm /N 1 /First 4 ${length}/Filter /FlateDecode>>\nstream\n`, body, '\nendstream\nendobj\n'];
};
const annot = (uri) => `1 0 <</Type /Annot /Subtype /Link /A <</S /URI /URI ${uri}>>>>`;
/** PDF 1.5 dont le lien est rangé dans un flux d'objets compressé. */
const pdfObjStm = (uri, opts) => concat('%PDF-1.5\n', ...objStm(5, annot(uri), opts), '%%EOF');
/** PDF dont le lien est précédé de flux qui se décompressent en `fillers` × 15 Mo. */
const pdfPadded = (uri, fillers) => concat('%PDF-1.5\n',
  ...Array.from({ length: fillers }, (_, i) => objStm(10 + i, ' '.repeat(15 * 1024 * 1024))).flat(),
  ...objStm(5, annot(uri)), '%%EOF');

describe('PdfLink', () => {
  it('reads back the data carried by the report link', async () => {
    const url = PdfLink.url(data);
    expect(url).toMatch(/^https:\/\/gt-steeve\.github\.io\/gestionBudget\/pages\/profil\.html#gb1\.[\w-]+\.[0-9a-f]{8}$/);
    expect(await PdfLink.readData(pdf(`(${url})`))).toEqual(data);
    expect(await PdfLink.readData(pdf(hex(url)))).toEqual(data);
  });

  it('reads the link inside a compressed object stream', async () => {
    const url = PdfLink.url(data);
    expect(await PdfLink.readData(pdfObjStm(`(${url})`))).toEqual(data);
    expect(await PdfLink.readData(pdfObjStm(hex(url)))).toEqual(data);
    expect(await PdfLink.readData(pdfObjStm(`(${url})`, { withLength: false }))).toEqual(data);
  });

  it('caps the total decompressed size and the number of streams', async () => {
    const url = PdfLink.url(data);
    // 15 Mo décompressés avant le lien : sous le plafond total de 32 Mo.
    expect(await PdfLink.readData(pdfPadded(`(${url})`, 1))).toEqual(data);
    // 45 Mo avant le lien : le budget est épuisé, le fichier est refusé.
    expect(await PdfLink.readData(pdfPadded(`(${url})`, 3))).toBeNull();
    // Le lien au-delà du 50e flux n'est pas lu.
    const many = concat('%PDF-1.5\n', ...Array.from({ length: 50 }, (_, i) => objStm(10 + i, 'x')).flat(),
      ...objStm(5, annot(`(${url})`)), '%%EOF');
    expect(await PdfLink.readData(many)).toBeNull();
  });

  it('refuses altered, truncated or foreign files', async () => {
    const url = PdfLink.url(data);
    const i = url.indexOf('#gb1.') + 10;
    const altered = url.slice(0, i) + (url[i] === 'A' ? 'B' : 'A') + url.slice(i + 1);
    expect(await PdfLink.readData(pdf(`(${altered})`))).toBeNull();
    expect(await PdfLink.readData(pdf(`(${url.slice(0, -12)})`))).toBeNull();
    expect(await PdfLink.readData(pdf('(https://example.com)'))).toBeNull();
    expect(await PdfLink.readData(pdfObjStm(`(${altered})`))).toBeNull();
    expect(await PdfLink.readData(new TextEncoder().encode(`PK pas un PDF (${url})`))).toBeNull();
  });
});
