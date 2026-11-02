/** 导出 .docx：用 OOXML 手写最小文档，零第三方依赖 */
import { sectionBody, sectionsOf, kindLabel } from './report';
import { sectionNumber } from './report-template';
import type { Report } from './types';
import { makeZip, type ZipEntry } from './zip';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface ParaOpts {
  bold?: boolean;
  size?: number; // 半磅，28 = 14pt
  align?: 'left' | 'center' | 'right';
  spacingBefore?: number;
  indent?: number;
}

function para(text: string, opts: ParaOpts = {}): string {
  const pPr: string[] = [];
  if (opts.align) pPr.push(`<w:jc w:val="${opts.align}"/>`);
  if (opts.spacingBefore) pPr.push(`<w:spacing w:before="${opts.spacingBefore}"/>`);
  if (opts.indent) pPr.push(`<w:ind w:left="${opts.indent}"/>`);
  const rPr: string[] = [];
  if (opts.bold) rPr.push('<w:b/>');
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`);
  const runs = `<w:r>${rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${runs}</w:p>`;
}

/** Markdown 风格的行 → Word 段落（- 开头做项目符号，带 ** 粗体的去掉标记） */
function lineToPara(line: string): string {
  const clean = line.replace(/\*\*/g, '');
  if (!clean.trim()) return para('');
  if (/^-\s+\[\s?\]\s+/.test(clean)) {
    return para('☐ ' + clean.replace(/^-\s+\[\s?\]\s+/, ''), { indent: 240 });
  }
  if (/^-\s+/.test(clean)) {
    return para('• ' + clean.replace(/^-\s+/, ''), { indent: 240 });
  }
  return para(clean);
}

export function buildDocxXml(r: Report): string {
  const body: string[] = [];

  body.push(para(`${r.start} ~ ${r.end} ${kindLabel(r.kind)}`, { bold: true, size: 36, align: 'center' }));
  body.push(para(''));

  const enabled = sectionsOf(r).filter((s) => s.enabled);
  enabled.forEach((section, index) => {
    body.push(para(`${sectionNumber(index)}、${section.title}`, { bold: true, size: 28, spacingBefore: 240 }));
    const lines = sectionBody(r, section.key);
    if (!lines.length) body.push(para('（无内容）'));
    for (const line of lines) body.push(lineToPara(line));
  });

  body.push(para(''));
  body.push(
    para(`生成时间：${r.generatedAt.slice(0, 16).replace('T', ' ')} · 状态：${r.status === 'final' ? '已定稿' : '草稿'}`, {
      size: 18,
      align: 'right',
    }),
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body>
</w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** 生成 .docx 字节流 */
export function buildDocx(r: Report): Uint8Array {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: utf8(CONTENT_TYPES) },
    { name: '_rels/.rels', data: utf8(ROOT_RELS) },
    { name: 'word/document.xml', data: utf8(buildDocxXml(r)) },
  ];
  return makeZip(entries);
}
