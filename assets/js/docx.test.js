import { describe, it, expect } from 'vitest';
const Docx = require('./docx.js');

const report = {
  title: 'Gestion budget',
  subtitle: 'Profil « Moi »',
  sections: [{
    title: 'Dépenses',
    blocks: [
      { type: 'p', text: 'Loyer & <charges>' },
      { type: 'kv', rows: [['Total', '10,00 €']] },
      { type: 'table', head: ['Libellé', 'Montant'], rows: [['Pain', '1,20 €']], foot: ['Total', '1,20 €'], align: ['left', 'right'] }
    ]
  }]
};

/** Noms des fichiers listés dans le répertoire central d'une archive ZIP. */
function zipNames(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const names = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50);
    const len = view.getUint16(pos + 28, true);
    names.push(new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + len)));
    pos += 46 + len;
  }
  return names;
}

describe('Docx', () => {
  it('computes the standard CRC-32', () => {
    expect(Docx.crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('escapes user text in the document XML', () => {
    const xml = Docx.documentXml(report);
    expect(xml).toContain('Loyer &amp; &lt;charges&gt;');
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('<w:jc w:val="right"/>');
  });

  it('builds a ZIP archive with the parts Word needs', () => {
    const bytes = Docx.build(report);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(zipNames(bytes)).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'
    ]);
  });
});
