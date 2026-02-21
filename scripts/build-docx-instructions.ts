/**
 * Генерация инструкций в формате Word (.docx) из Markdown.
 * Запуск: npx tsx scripts/build-docx-instructions.ts
 * Результат: docs/ИНСТРУКЦИЯ_КОМПЛЕКТАТОР.docx и docs/ИНСТРУКЦИЯ_АДМИН_РЕГИСТРАЦИЯ.docx
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  convertInchesToTwip,
} from 'docx';

const DOCS_DIR = path.join(__dirname, '..', 'docs');

type Block = { type: 'h1' | 'h2' | 'bullet' | 'paragraph'; text: string };

function parseMarkdownToBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h1', text: trimmed.replace(/^##\s+/, '').replace(/\s*\{#.*\}$/, '') });
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h2', text: trimmed.replace(/^###\s+/, '').replace(/\s*\{#.*\}$/, '') });
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-*]\s+/, '') });
      continue;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^\d+\.\s+/, '') });
      continue;
    }
    blocks.push({ type: 'paragraph', text: trimmed });
  }
  return blocks;
}

function stripMarkdownBold(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

function buildRuns(text: string): TextRun[] {
  const parts: TextRun[] = [];
  let rest = text;
  while (rest.length > 0) {
    const boldStart = rest.indexOf('**');
    if (boldStart === -1) {
      if (rest.length) parts.push(new TextRun({ text: stripMarkdownBold(rest) }));
      break;
    }
    if (boldStart > 0) {
      parts.push(new TextRun({ text: stripMarkdownBold(rest.slice(0, boldStart)) }));
    }
    const boldEnd = rest.indexOf('**', boldStart + 2);
    if (boldEnd === -1) {
      parts.push(new TextRun({ text: rest.slice(boldStart) }));
      break;
    }
    parts.push(new TextRun({ text: rest.slice(boldStart + 2, boldEnd), bold: true }));
    rest = rest.slice(boldEnd + 2);
  }
  return parts.length ? parts : [new TextRun({ text: stripMarkdownBold(text) })];
}

function blocksToDocChildren(blocks: Block[]): Paragraph[] {
  const children: Paragraph[] = [];
  for (const b of blocks) {
    const text = stripMarkdownBold(b.text).trim();
    if (!text && b.type === 'paragraph') continue;

    switch (b.type) {
      case 'h1':
        children.push(
          new Paragraph({
            text: text,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      case 'h2':
        children.push(
          new Paragraph({
            text: text,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          })
        );
        break;
      case 'bullet':
        children.push(
          new Paragraph({
            children: buildRuns(b.text),
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        );
        break;
      case 'paragraph':
      default:
        children.push(
          new Paragraph({
            children: buildRuns(b.text),
            spacing: { after: 120 },
          })
        );
    }
  }
  return children;
}

async function buildDocFromMd(mdPath: string, title: string): Promise<{ doc: Document }> {
  const content = fs.readFileSync(mdPath, 'utf-8');
  const blocks = parseMarkdownToBlocks(content);

  const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
  const titleText = firstLine.startsWith('# ') ? firstLine.replace(/^#\s+/, '').trim() : title;

  const children = blocksToDocChildren(blocks);

  const doc = new Document({
    creator: '1002doors',
    title: titleText,
    description: titleText,
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: { size: 22 }, // 11 pt
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: 28, bold: true },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: 24, bold: true },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.79),
              right: convertInchesToTwip(0.79),
              bottom: convertInchesToTwip(0.79),
              left: convertInchesToTwip(0.79),
            },
          },
        },
        children: [
          new Paragraph({
            text: titleText,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 },
          }),
          ...children,
        ],
      },
    ],
  });
  return { doc };
}

async function main() {
  const pairs: [string, string][] = [
    ['ИНСТРУКЦИЯ_КОМПЛЕКТАТОР.md', 'ИНСТРУКЦИЯ_КОМПЛЕКТАТОР.docx'],
    ['ИНСТРУКЦИЯ_АДМИН_РЕГИСТРАЦИЯ.md', 'ИНСТРУКЦИЯ_АДМИН_РЕГИСТРАЦИЯ.docx'],
  ];

  for (const [mdName, docxName] of pairs) {
    const mdPath = path.join(DOCS_DIR, mdName);
    const outPath = path.join(DOCS_DIR, docxName);
    if (!fs.existsSync(mdPath)) {
      console.warn('Пропуск (файл не найден):', mdPath);
      continue;
    }
    const title = docxName.replace(/\.docx$/, '');
    const { doc } = await buildDocFromMd(mdPath, title);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buffer);
    console.log('Создан:', outPath);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
