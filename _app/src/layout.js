// Shared by the server and the browser, so nothing here can touch Node.
const pad = (n) => String(n).padStart(2, '0');

export const minuteOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const clockOf = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// What the owner sees each resident called, when it isn't the folder's name: { Money: 'Banker' }. Folders keep their names, so nothing on disk moves.
export const DISPLAY_NAMES = {};
export const shown = (name) => DISPLAY_NAMES[name] ?? name;

/** The Claude levels a resident can run on. The server only ever passes one of these ids to the CLI. */
export const CLAUDE_LEVELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', help: 'The fastest and lightest.' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', help: 'The default. Good for almost everything.' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', help: 'Engineer\'s default. Better at hard problems, and uses more of your plan.' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', help: 'The most capable, and the one that uses the most of your plan.' },
];
/** What a resident can be given when it levels up. `place` is where it goes in the room. */
export const GIFTS = [
  { id: 'plant', label: 'Big plant', place: 'floor' },
  { id: 'lamp', label: 'Floor lamp', place: 'floor' },
  { id: 'painting', label: 'Painting', place: 'wall' },
  { id: 'clock', label: 'Wall clock', place: 'wall' },
  { id: 'pennant', label: 'Pennant', place: 'wall' },
  { id: 'trophy', label: 'Trophy', place: 'wall' },
  { id: 'globe', label: 'Globe', place: 'floor' },
  { id: 'radio', label: 'Radio', place: 'floor' },
  { id: 'pouf', label: 'Pouf', place: 'floor' },
  { id: 'aquarium', label: 'Fish tank', place: 'floor' },
];
export const JOB_STATUSES = [['new', 'New'], ['apply', 'To apply'], ['applied', 'Applied'], ['interview', 'Interview'], ['offer', 'Offer'], ['dropped', 'Dropped']];
const DEFAULT_LEVEL = 'claude-sonnet-5-5';
export const defaultLevelOf = (name) => (/^engineer$/i.test(name) ? 'claude-opus-5-5' : DEFAULT_LEVEL);

const LAND_RY = 166; // half the island's height in art pixels
const SKY = 130; // open sea above the first screen, where God's cloud is: you have to scroll up to find it

/**
 * The island's camera. Art pixels must be a whole number of device pixels, or display scaling
 * (125%, 150%) draws them unevenly. s is CSS pixels per art pixel, dev is device pixels per art pixel.
 */
export function islandView(vw, vh, rx, dpr = 1) {
  const fit = Math.floor(Math.min((vw * dpr) / (2 * rx + 24), (vh * dpr) / (2 * LAND_RY + 8)));
  const dev = Math.max(Math.ceil(1.3 * dpr), fit);
  const s = dev / dpr;
  const LW = Math.max(Math.ceil(vw / s), 2 * rx + 40);
  const LH = Math.max(Math.ceil(vh / s), 2 * LAND_RY + 16) + SKY;
  const cy = ((LH - SKY) >> 1) + 4 + SKY;
  return { s, dev, LW, LH, cx: LW >> 1, cy, godY: 96 - cy, rx, ry: LAND_RY, pans: LW > Math.ceil(vw / s) || LH > Math.ceil(vh / s) };
}

/**
 * Spreads things of the given widths evenly along a strip of wall or floor, so they can't overlap.
 * Earlier items matter more: whatever no longer fits is left out. Returns each kept item's left edge.
 */
export function packLane(widths, room) {
  let used = 0;
  const kept = [];
  for (const w of widths) {
    if (used + w > room) break;
    used += w;
    kept.push(w);
  }
  const gap = (room - used) / (kept.length + 1);
  let x = gap;
  return kept.map((w) => {
    const left = Math.floor(x);
    x += w + gap;
    return left;
  });
}

export const addDays =(day, by) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 864e5).toISOString().slice(0, 10);

const SHORTEST_VISIBLE = 20; // a 5-minute block is still drawn tall enough to read, so it needs that much room

/** Puts overlapping timed events side by side. Returns a Map of id to { lane, lanes }. */
export function laneOut(events) {
  const sorted = [...events].sort((a, b) => minuteOf(a.time) - minuteOf(b.time) || b.minutes - a.minutes);
  const placed = new Map();
  let group = [];
  let laneEnds = [];
  let groupEnd = -1;
  const flush = () => {
    group.forEach(([id, lane]) => placed.set(id, { lane, lanes: laneEnds.length }));
    group = [];
    laneEnds = [];
  };
  for (const event of sorted) {
    const start = minuteOf(event.time);
    const end = start + Math.max(event.minutes, SHORTEST_VISIBLE);
    if (start >= groupEnd) flush();
    const free = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    const lane = free < 0 ? laneEnds.length : free;
    laneEnds[lane] = end;
    group.push([event.id, lane]);
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return placed;
}
