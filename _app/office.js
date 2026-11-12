// Reads PowerPoint, Word and Excel files as plain Markdown, so a resident that can only read text can still use them.
// They are zip files of XML. Nothing here writes next to the originals: syncOffice keeps its copies somewhere else.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const MAX_ROWS = 200;
const MAX_COLS = 30;
const MAX_CHARS = 400_000;
const MAX_DEPTH = 8;
const KINDS = /\.(pptx|docx|xlsx)$/i;

/** Every entry of a zip, by name, with where its bytes start. Zip64 (files over 4 GB) is refused. */
function entriesOf(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('not an Office file');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('the file is too large');
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('the file is damaged');
    const nameLen = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    entries.set(name, { method: buf.readUInt16LE(at + 10), size: buf.readUInt32LE(at + 20), local: buf.readUInt32LE(at + 42) });
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return entries;
}

function textOf(buf, entries, name) {
  const e = entries.get(name);
  if (!e) return null;
  const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
  const raw = buf.subarray(start, start + e.size);
  if (e.method !== 0 && e.method !== 8) throw new Error('the file uses a compression that can\'t be read');
  return (e.method === 0 ? raw : inflateRawSync(raw)).toString('utf8');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e] ?? m;
});

/** Text of each <tag>…</tag> block, in order: its runs joined, with tabs and line breaks as spaces. */
function blocks(xml, tag, run) {
  const open = new RegExp(`<${tag}[ >/][\\s\\S]*?</${tag}>`, 'g');
  const text = new RegExp(`<${run}(?: [^>]*)?>([^<]*)</${run}>|<(?:\\w+:)?(?:tab|br)\\s*/>`, 'g');
  return [...xml.matchAll(open)].map(([block]) => decode([...block.matchAll(text)].map((m) => m[1] ?? ' ').join('')).trim());
}

const numbered = (entries, prefix) => [...entries.keys()]
  .filter((n) => n.startsWith(prefix) && n.endsWith('.xml'))
  .sort((a, b) => Number(a.match(/(\d+)\.xml$/)?.[1]) - Number(b.match(/(\d+)\.xml$/)?.[1]));

function slides(buf, entries) {
  return numbered(entries, 'ppt/slides/slide').map((name, i) => {
    const lines = blocks(textOf(buf, entries, name), 'a:p', 'a:t').filter(Boolean);
    const notesName = `ppt/notesSlides/notesSlide${name.match(/(\d+)\.xml$/)[1]}.xml`;
    const notes = entries.has(notesName) ? blocks(textOf(buf, entries, notesName), 'a:p', 'a:t').filter(Boolean) : [];
    return [`## Slide ${i + 1}`, ...lines, ...(notes.length ? ['', '_Notes:_', ...notes] : [])].join('\n');
  }).join('\n\n');
}

function document(buf, entries) {
  const xml = textOf(buf, entries, 'word/document.xml');
  if (!xml) throw new Error('it has no Word text');
  return [...xml.matchAll(/<w:p[ >/][\s\S]*?<\/w:p>/g)].map(([p]) => {
    const text = blocks(p, 'w:p', 'w:t')[0];
    const heading = p.match(/<w:pStyle w:val="Heading(\d)"/);
    return text && heading ? `${'#'.repeat(Math.min(6, Number(heading[1])))} ${text}` : text;
  }).filter((t) => t !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

const columnOf = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const cell = (s) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

function sheets(buf, entries) {
  const shared = (textOf(buf, entries, 'xl/sharedStrings.xml') ?? '').split(/<si[ >]/).slice(1)
    .map((si) => decode([...si.matchAll(/<t(?: [^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join('')));
  const book = textOf(buf, entries, 'xl/workbook.xml') ?? '';
  const rels = textOf(buf, entries, 'xl/_rels/workbook.xml.rels') ?? '';
  const target = (id) => {
    const tag = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => new RegExp(`\\bId="${id}"`).test(t));
    const to = tag?.match(/\bTarget="([^"]+)"/)?.[1];
    return to && (to.startsWith('/') ? to.slice(1) : `xl/${to}`);
  };
  const out = [];
  for (const [tag] of book.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(tag.match(/\bname="([^"]*)"/)?.[1] ?? 'Sheet');
    const path = target(tag.match(/\br:id="([^"]+)"/)?.[1]);
    const xml = path && textOf(buf, entries, path);
    if (!xml) continue;
    const rows = [];
    let total = 0;
    for (const [, body] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const [, col, attrs, inner = ''] of body.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const kind = attrs.match(/\bt="(\w+)"/)?.[1];
        const value = inner.match(/<v>([^<]*)<\/v>/)?.[1];
        let text = '';
        if (kind === 's') text = shared[Number(value)] ?? '';
        else if (kind === 'inlineStr') text = decode([...inner.matchAll(/<t(?: [^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(''));
        else if (value !== undefined) text = kind === 'b' ? (value === '1' ? 'yes' : 'no') : decode(value);
        const at = columnOf(col);
        if (text && at < MAX_COLS) cells[at] = cell(text);
      }
      if (!cells.some(Boolean)) continue;
      total++;
      if (rows.length < MAX_ROWS) rows.push(cells);
    }
    if (!rows.length) { out.push(`## ${name}\n\n(empty)`); continue; }
    const width = Math.max(...rows.map((r) => r.length));
    const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
    out.push([`## ${name}`, '', line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line), ...(total > rows.length ? ['', `(${total - rows.length} more rows)`] : [])].join('\n'));
  }
  return out.join('\n\n');
}

/** The text of a .pptx, .docx or .xlsx as Markdown. Throws, with a reason the owner can read, when it can't. */
export function officeText(path) {
  const buf = readFileSync(path);
  const entries = entriesOf(buf);
  const kind = path.match(KINDS)?.[1].toLowerCase();
  const body = (kind === 'pptx' ? slides : kind === 'docx' ? document : sheets)(buf, entries);
  const clipped = body.length > MAX_CHARS ? `${body.slice(0, MAX_CHARS)}\n\n(… the rest doesn't fit in the copy)` : body;
  return `${clipped || '(no text)'}\n`;
}

/**
 * Keeps a Markdown copy of every Office file under `sources` in `out`, as out/<folder name>/<same path>.md.
 * Only copies older than their file are redone. A file that can't be read gets a copy saying why, once.
 */
export function syncOffice(sources, out) {
  const walk = (root, rel, depth) => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (/^[.~]|^node_modules$/.test(entry.name)) continue;
      const next = join(rel, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) walk(root, next, depth + 1);
      } else if (KINDS.test(entry.name)) {
        const copy = join(out, basename(root) || 'root', `${next}.md`);
        const source = join(root, next);
        if (existsSync(copy) && statSync(copy).mtimeMs >= statSync(source).mtimeMs) continue;
        let text;
        try {
          text = officeText(source);
        } catch (err) {
          text = `Couldn't read this file: ${err.message}.\n`;
        }
        mkdirSync(dirname(copy), { recursive: true });
        writeFileSync(copy, text);
      }
    }
  };
  for (const root of sources) if (existsSync(root)) walk(root, '', 0);
}
