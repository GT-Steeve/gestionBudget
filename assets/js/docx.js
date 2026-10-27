/* ==========================================================================
   Gestion budget — génération d'un fichier Word (.docx) sans bibliothèque ni
   connexion (partagé navigateur + Node/tests). Un .docx est une archive ZIP
   de fichiers XML : on écrit ces XML puis une archive ZIP sans compression.
   Rapport attendu : { title, subtitle, sections: [{ title, blocks }] }, où un
   bloc vaut { type: 'p' | 'h3', text }, { type: 'kv', rows: [[libellé, valeur]] }
   ou { type: 'table', head: [], rows: [[]], foot?: [], align?: ['left'|'right'] }.
   ========================================================================== */
'use strict';

(function (root, factory) {
  const docx = factory();
  if (typeof module === 'object' && module.exports) module.exports = docx;
  if (root) root.Docx = docx;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const PAGE_WIDTH = 9638; // largeur utile d'une page A4 (marges de 2 cm), en twips

  /* ---------- XML Word ---------- */

  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const run = (text, { bold = false } = {}) =>
    `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

  const para = (text, { style, bold, align } = {}) => {
    const props = (style ? `<w:pStyle w:val="${style}"/>` : '') + (align ? `<w:jc w:val="${align}"/>` : '');
    return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${run(text, { bold })}</w:p>`;
  };

  function table(rows, { head, foot, align = [] } = {}) {
    const cols = (head || rows[0] || foot || ['']).length;
    const width = Math.floor(PAGE_WIDTH / cols);
    const cell = (text, i, { bold = false, shade = false } = {}) =>
      `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="EDE7DA"/>' : ''}</w:tcPr>` +
      `${para(text, { bold, align: align[i] === 'right' ? 'right' : undefined })}</w:tc>`;
    const row = (cells, opts = {}) =>
      `<w:tr>${opts.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(c, i, opts)).join('')}</w:tr>`;
    const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFB6A3"/>`;
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
      `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
      '<w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
      `<w:tblGrid>${'<w:gridCol w:w="' + width + '"/>'.repeat(cols)}</w:tblGrid>` +
      (head ? row(head, { header: true, bold: true, shade: true }) : '') +
      rows.map((r) => row(r)).join('') +
      (foot ? row(foot, { bold: true }) : '') +
      // Paragraphe vide après chaque tableau : Word colle sinon deux tableaux consécutifs.
      '</w:tbl><w:p/>';
  }

  function block(b) {
    switch (b.type) {
      case 'h3': return para(b.text, { style: 'Heading2' });
      case 'kv': return table(b.rows, { align: ['left', 'right'] });
      case 'table': return table(b.rows, b);
      default: return para(b.text);
    }
  }

  function documentXml(report) {
    const body = [
      para(report.title, { style: 'Title' }),
      report.subtitle ? para(report.subtitle, { style: 'Subtitle' }) : '',
      ...report.sections.map((s) => para(s.title, { style: 'Heading1' }) + s.blocks.map(block).join(''))
    ].join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
  }

  const style = (id, name, { size, color, bold, before = 0, after = 120, keepNext = false } = {}) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
    `<w:pPr>${keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="${before}" w:after="${after}"/></w:pPr>` +
    `<w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${size}"/></w:rPr></w:style>`;

  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="21"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    style('Title', 'Title', { size: 40, bold: true, color: '2A251C', after: 60 }) +
    style('Subtitle', 'Subtitle', { size: 20, color: '7A7161', after: 240 }) +
    style('Heading1', 'heading 1', { size: 30, bold: true, color: '256ABF', before: 360, after: 120, keepNext: true }) +
    style('Heading2', 'heading 2', { size: 23, bold: true, color: '2A251C', before: 200, after: 80, keepNext: true }) +
    '</w:styles>';

  const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';

  const rels = (id, type, target) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>` +
    '</Relationships>';

  /* ---------- Archive ZIP (méthode « stockée », sans compression) ---------- */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** files : [{ name, data: Uint8Array }] → archive ZIP (Uint8Array). */
  function zip(files) {
    const enc = new TextEncoder();
    const DOS_DATE = (1 << 5) | 1; // 1er janvier 1980 : date fixe, le contenu suffit
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(12, DOS_DATE, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, f.data.length, true);
      local.setUint32(22, f.data.length, true);
      local.setUint16(26, name.length, true);
      locals.push(new Uint8Array(local.buffer), name, f.data);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(14, DOS_DATE, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, f.data.length, true);
      central.setUint32(24, f.data.length, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      centrals.push(new Uint8Array(central.buffer), name);
      offset += 30 + name.length + f.data.length;
    }
    const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((sum, b) => sum + b.length, 0));
    let pos = 0;
    for (const b of parts) { out.set(b, pos); pos += b.length; }
    return out;
  }

  /** Rapport → fichier .docx (Uint8Array), lisible par Word et importable dans Google Docs. */
  function build(report) {
    const enc = new TextEncoder();
    const file = (name, xml) => ({ name, data: enc.encode(xml) });
    return zip([
      file('[Content_Types].xml', CONTENT_TYPES),
      file('_rels/.rels', rels('rId1', 'officeDocument', 'word/document.xml')),
      file('word/_rels/document.xml.rels', rels('rId1', 'styles', 'styles.xml')),
      file('word/document.xml', documentXml(report)),
      file('word/styles.xml', STYLES)
    ]);
  }

  return { MIME, build, documentXml, zip, crc32 };
});
