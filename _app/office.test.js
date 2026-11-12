import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { officeText, syncOffice } from './office.js';

/** A zip of [name, text] files the way Office writes one: deflated entries, then a central directory. */
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(8, 10);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data);
    central.push(head, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

const folder = () => mkdtempSync(join(tmpdir(), 'office-'));
const para = (...runs) => `<a:p>${runs.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join('')}</a:p>`;
const slide = (...paras) => `<p:sld><p:txBody>${paras.join('')}</p:txBody></p:sld>`;

test('a presentation reads slide by slide, in slide order, with its notes', () => {
  const dir = folder();
  const file = join(dir, 'poster.pptx');
  writeFileSync(file, zip([
    ['ppt/slides/slide10.xml', slide(para('Last'))],
    ['ppt/slides/slide2.xml', slide(para('Results &amp; ', 'next steps'), para(''))],
    ['ppt/slides/slide1.xml', slide(para('Title'), `<a:p><a:pPr/><a:r><a:t>UWB</a:t></a:r><a:br/><a:r><a:t>tag</a:t></a:r></a:p>`)],
    ['ppt/notesSlides/notesSlide2.xml', slide(para('Say this slowly'))],
  ]));
  assert.equal(officeText(file), '## Slide 1\nTitle\nUWB tag\n\n## Slide 2\nResults & next steps\n\n_Notes:_\nSay this slowly\n\n## Slide 3\nLast\n');
});

test('a Word file keeps headings and paragraphs, and the tab between words', () => {
  const dir = folder();
  const file = join(dir, 'paper.docx');
  const p = (text, style = '') => `<w:p>${style && `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  writeFileSync(file, zip([['word/document.xml', `<w:document><w:body>${p('Intro', 'Heading1')}${p('One')}<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t></w:r></w:p>${p('Two')}</w:body></w:document>`]]));
  assert.equal(officeText(file), '# Intro\nOne\na b\nTwo\n');
});

test('a spreadsheet becomes one table per sheet, with gaps, inline text and a row cap', () => {
  const dir = folder();
  const file = join(dir, 'data.xlsx');
  const rows = Array.from({ length: 205 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}"><v>${i}</v></c></row>`).join('');
  writeFileSync(file, zip([
    ['xl/workbook.xml', '<workbook><sheets><sheet name="Data &amp; more" sheetId="1" r:id="rId2"/><sheet name="Other" sheetId="2" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet2.xml"/><Relationship Target="worksheets/sheet1.xml" Id="rId2" Type="x"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>Image</t></si><si><r><t>In</t></r><r><t>dex | x</t></r></si></sst>'],
    ['xl/worksheets/sheet1.xml', `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>${rows}</sheetData></worksheet>`],
    ['xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>only</t></is></c><c r="C1" t="b"><v>1</v></c></row></sheetData></worksheet>'],
  ]));
  const text = officeText(file);
  const [first, second] = text.split('\n\n## ');
  assert.match(first, /^## Data & more\n\n\| Image \|  \| Index \\\| x \|\n\| --- \| --- \| --- \|\n\| 0 \|  \|  \|\n/);
  assert.equal(first.split('\n').filter((l) => l.startsWith('| ')).length, 201, 'header, its separator and 199 rows');
  assert.match(first, /\(6 more rows\)\n?$/);
  assert.equal(second, 'Other\n\n|  | only | yes |\n| --- | --- | --- |\n');
});

test('what is not an Office file says so', () => {
  const dir = folder();
  const file = join(dir, 'broken.docx');
  writeFileSync(file, 'plain text');
  assert.throws(() => officeText(file), /not an Office file/);
});

test('copies live apart from the originals and are only redone when the original changes', () => {
  const sources = folder();
  const out = folder();
  mkdirSync(join(sources, 'P2', 'data'), { recursive: true });
  mkdirSync(join(sources, 'node_modules'));
  const good = join(sources, 'P2', 'data', 'poster.pptx');
  writeFileSync(good, zip([['ppt/slides/slide1.xml', slide(para('Hello'))]]));
  writeFileSync(join(sources, '~$poster.pptx'), 'lock file');
  writeFileSync(join(sources, 'node_modules', 'x.docx'), 'not used');
  writeFileSync(join(sources, 'bad.xlsx'), 'nope');
  writeFileSync(join(sources, 'notes.txt'), 'ignored');

  syncOffice([sources, join(sources, 'missing')], out);
  const root = join(out, sources.split(/[\\/]/).pop());
  const copy = join(root, 'P2', 'data', 'poster.pptx.md');
  assert.equal(readFileSync(copy, 'utf8'), '## Slide 1\nHello\n');
  assert.match(readFileSync(join(root, 'bad.xlsx.md'), 'utf8'), /^Couldn't read this file: not an Office file/);
  assert.equal(existsSync(join(root, '~$poster.pptx.md')), false);
  assert.equal(existsSync(join(root, 'node_modules')), false);
  assert.equal(existsSync(join(root, 'notes.txt.md')), false);
  assert.equal(readFileSync(good).length > 0, true, 'the original is untouched');

  writeFileSync(copy, 'kept as is');
  syncOffice([sources], out);
  assert.equal(readFileSync(copy, 'utf8'), 'kept as is', 'up to date, so not redone');
  const later = new Date(statSync(copy).mtimeMs + 5000);
  utimesSync(good, later, later);
  syncOffice([sources], out);
  assert.equal(readFileSync(copy, 'utf8'), '## Slide 1\nHello\n', 'the original changed, so it is redone');
});
