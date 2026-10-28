import { describe, it, expect } from 'vitest';
const PdfLink = require('./pdflink.js');

const data = { app: 'gestion-budget', nom: 'Élise « test »', data: { charges: [1, 2] } };
/** PDF minimal portant un lien, comme l'écrit la fenêtre d'impression du navigateur. */
const pdf = (uri) => new TextEncoder().encode(`%PDF-1.4\n1 0 obj\n<</Type /Annot /Subtype /Link /A <</S /URI /URI ${uri}>>>>\nendobj\n%%EOF`);
const hex = (s) => `<${[...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('')}>`;

describe('PdfLink', () => {
  it('reads back the data carried by the report link', () => {
    const url = PdfLink.url(data);
    expect(url).toMatch(/^https:\/\/gt-steeve\.github\.io\/gestionBudget\/pages\/profil\.html#gb1\.[\w-]+\.[0-9a-f]{8}$/);
    expect(PdfLink.readData(pdf(`(${url})`))).toEqual(data);
    expect(PdfLink.readData(pdf(hex(url)))).toEqual(data);
  });

  it('refuses altered, truncated or foreign files', () => {
    const url = PdfLink.url(data);
    const i = url.indexOf('#gb1.') + 10;
    const altered = url.slice(0, i) + (url[i] === 'A' ? 'B' : 'A') + url.slice(i + 1);
    expect(PdfLink.readData(pdf(`(${altered})`))).toBeNull();
    expect(PdfLink.readData(pdf(`(${url.slice(0, -12)})`))).toBeNull();
    expect(PdfLink.readData(pdf('(https://example.com)'))).toBeNull();
    expect(PdfLink.readData(new TextEncoder().encode(`PK pas un PDF (${url})`))).toBeNull();
  });
});
