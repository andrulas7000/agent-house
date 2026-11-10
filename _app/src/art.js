// All the art in the game, drawn in code on small canvases and scaled up by whole numbers.
// Everything is original: no sprite, tile or palette here comes from any existing game.
import { packLane } from './layout.js';

const OUT = '#3b2318';
const INK = '#2c1b2e';
const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => `#${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
const lit = (c, t = 0.3) => mix(c, '#fff0c2', t);
const dim = (c, t = 0.3) => mix(c, '#3a1840', t);

function hash(text) {
  let h = 2166136261;
  for (const c of text) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grain = (x, y) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
function smooth(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = grain(xi, yi) + (grain(xi + 1, yi) - grain(xi, yi)) * u;
  const b = grain(xi, yi + 1) + (grain(xi + 1, yi + 1) - grain(xi, yi + 1)) * u;
  return a + (b - a) * v;
}
const fbm = (x, y) => smooth(x, y) * 0.6 + smooth(x * 2.1, y * 2.1) * 0.28 + smooth(x * 4.3, y * 4.3) * 0.12;

/** Paints a w×h sprite with a one-pixel margin, then rings it in dark brown. */
function sprite(w, h, paint, outline = true, ringColor = OUT) {
  const c = make(w + 2, h + 2);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.translate(1, 1);
  paint((x, y, wd, ht, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, wd, ht);
  });
  if (!outline) return c;
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  const W = c.width, H = c.height;
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
  const ring = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ring.push((y * W + x) * 4);
    }
  }
  const [r, gr, b] = rgb(ringColor);
  ring.forEach((i) => { d[i] = r; d[i + 1] = gr; d[i + 2] = b; d[i + 3] = 255; });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.putImageData(im, 0, 0);
  return c;
}

const disc = (r, cx, cy, rad, col) => {
  for (let y = -rad; y <= rad; y++) {
    const half = Math.floor(Math.sqrt(rad * rad - y * y));
    r(cx - half, cy + y, half * 2 + 1, 1, col);
  }
};
const oval = (r, cx, cy, rx, ry, col) => {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
    r(cx - half, cy + y, half * 2 + 1, 1, col);
  }
};
const rounded = (r, x, y, w, h, col) => {
  r(x + 2, y, w - 4, h, col);
  r(x, y + 2, w, h - 4, col);
  r(x + 1, y + 1, w - 2, h - 2, col);
};

// The resident's look. Colours stay tied to the name, so a folder always looks like itself.
const WALLS = [
  { wall: '#3aa39a', ink: '#06231f' },
  { wall: '#e0ad45', ink: '#2b1d00' },
  { wall: '#875aa3', ink: '#ffffff' },
  { wall: '#d9694a', ink: '#260800' },
  { wall: '#74ab5c', ink: '#0c2305' },
  { wall: '#4a66c4', ink: '#ffffff' },
  { wall: '#df7fa3', ink: '#2b0614' },
];
const SKINS = ['#f6cfa8', '#e0a878', '#b97a4e', '#8a5433', '#5d3822'];
const HAIR_COLORS = ['#3a2a3e', '#5b3419', '#b4551f', '#e9c04f', '#7d3fb0', '#d9486f'];
const SHIRTS = ['#f2ead8', '#2f4db0', '#c6303b', '#17806f', '#f0a12a', '#4a3370'];
const PANTS = ['#2f3a5f', '#4a4a55', '#6a4427', '#25675d'];
const HAIR_STYLES = ['short', 'long', 'puff'];
const HATS = [null, null, 'beanie', 'cap'];
const roleOf = (name) => {
  if (/engin|code|dev/i.test(name)) return { hat: 'hardhat' };
  if (/music|song|audio/i.test(name)) return { phones: true };
  if (/tutor|teach/i.test(name)) return { hat: 'mortar' };
  if (/study|school/i.test(name)) return { hat: 'beanie', glasses: true };
  if (/money|bank/i.test(name)) return { hat: 'tophat', tie: true, shirt: '#2f3a5f', pants: '#2f3a5f', wall: '#74ab5c', ink: '#0c2305' };
  if (/^jobs$|office/i.test(name)) return { hat: null, tie: true, glasses: true, shirt: '#f2ead8', pants: '#4a4a55' };
  if (/pregonero/i.test(name)) return { hat: 'cap', shirt: '#17806f' };
  return {};
};

const looks = new Map();
export function lookOf(name) {
  if (looks.has(name)) return looks.get(name);
  const h = hash(/^mayor$/i.test(name) ? 'Manager' : name); // renamed, not replaced: same face, same roof
  const pick = (list, shift) => list[(h >>> shift) % list.length];
  const divine = /^god$/i.test(name)
    ? { wall: '#e0ad45', ink: '#2b1d00', hair: '#f4efe6', hairStyle: 'short', skin: '#f6cfa8', shirt: '#f4efe6', pants: '#e8d6a8', halo: true }
    : {};
  const look = {
    id: name,
    ...pick(WALLS, 0),
    skin: pick(SKINS, 3),
    hair: pick(HAIR_COLORS, 6),
    shirt: pick(SHIRTS, 9),
    pants: pick(PANTS, 12),
    hairStyle: pick(HAIR_STYLES, 15),
    pattern: (h >>> 21) % 3,
    glasses: ((h >>> 24) & 3) === 0,
    tie: /mayor|manag|boss/i.test(name),
    hat: /mayor|manag|boss|god/i.test(name) ? null : pick(HATS, 28),
    ...roleOf(name),
    ...divine,
  };
  looks.set(name, look);
  return look;
}

const memo = new Map();
const once = (key, build) => {
  if (!memo.has(key)) memo.set(key, build());
  return memo.get(key);
};

const NAVY = '#232548';

/**
 * One chunky figure drawn on a 14×18 grid: a head that is most of the body, flat three-tone colour,
 * navy lines under the hair and chin, two dash eyes. Walking sprites and portraits share it.
 */
function paintPerson(r, look, dir, frame, mood, open) {
  const { skin, hair, shirt, pants, hat, wall } = look;
  const skinLit = mix(skin, '#ffeadf', 0.5), skinDim = mix(skin, '#a8442c', 0.34);
  const hairLit = lit(hair, 0.3), hairDim = dim(hair, 0.3);
  const shirtLit = lit(shirt, 0.25), shirtDim = dim(shirt, 0.34);
  const pantsDim = dim(pants, 0.28);
  const shoe = look.halo ? '#e0c98f' : '#5b3a2e';
  const leg = (x, lifted, tone) => {
    if (lifted) r(x, 15, 2, 1, shoe);
    else { r(x, 15, 2, 1, tone); r(x, 16, 2, 1, shoe); }
  };

  // The navy line runs along the face only, so it never crosses the back or side of someone's hair.
  const browLine = () => {
    r(3, 4, 8, 1, dir === 'up' ? hair : NAVY);
    if (dir === 'side') r(3, 4, 4, 1, hair);
  };

  const hairTop = () => {
    const from = look.halo ? 2 : 0; // the halo needs the top rows
    if (hat) return;
    if (look.hairStyle === 'puff') {
      r(2, 0, 10, 1, hair);
      r(1, 1, 12, 1, hair);
      r(0, 2, 14, 2, hair);
      r(0, 2, 4, 2, hairDim);
      r(9, 1, 3, 1, hairLit);
      r(10, 2, 4, 1, hairLit);
    } else {
      if (!from) r(3, 0, 8, 1, hair);
      if (!from) r(3, 0, 2, 1, hairDim);
      if (!from) r(2, 1, 10, 1, hair);
      r(1, 2, 12, 2, hair);
      r(1, 2, 3, 2, hairDim);
      if (!from) r(9, 1, 3, 1, hairLit);
      r(8, 2, 4, 1, hairLit);
    }
    r(1, 4, 2, 1, hairDim);
    r(11, 4, 2, 1, hair);
    browLine();
    r(9, 4, 2, 1, hair); // the fringe breaks the line, so nobody's hair looks painted on
  };

  const headgear = () => {
    if (hat === 'hardhat') {
      const Y = '#f2b632', YL = '#ffdc73', YD = '#c98a1e';
      r(3, 0, 8, 1, Y); r(2, 1, 10, 2, Y);
      r(2, 1, 3, 2, YD); r(9, 1, 3, 2, YL);
      r(6, 0, 2, 3, YL);
      r(0, 3, 14, 1, YD); r(8, 3, 6, 1, Y);
      browLine();
    } else if (hat === 'mortar') {
      r(3, 3, 8, 2, '#2f3358');
      r(0, 1, 14, 2, '#3f4578'); r(0, 1, 14, 1, '#5d648f');
      browLine();
      r(12, 3, 1, 4, '#ffd95a');
    } else if (hat === 'beanie' || hat === 'cap') {
      const lite = lit(wall, 0.25), dark = dim(wall, 0.3);
      r(3, 0, 8, 1, wall); r(2, 1, 10, 1, wall);
      r(2, 1, 3, 1, dark); r(9, 1, 3, 1, lite);
      if (hat === 'beanie') {
        r(1, 2, 12, 2, lite);
        for (let x = 2; x < 13; x += 2) r(x, 2, 1, 2, dark);
      } else {
        r(2, 2, 10, 2, wall);
        r(2, 2, 3, 2, dark);
        r(dir === 'side' ? 9 : 3, 3, dir === 'side' ? 5 : 9, 1, lite); // the peak
      }
      browLine();
    } else if (hat === 'tophat') {
      r(3, 0, 8, 2, '#2a2a3a'); r(3, 0, 2, 2, '#4a4a60');
      r(3, 2, 8, 1, '#c6303b');
      r(1, 3, 12, 1, '#2a2a3a');
      browLine();
    }
    if (hat && hat !== 'cans') { r(2, 4, 1, 1, hairDim); r(11, 4, 1, 1, hair); }
    if (look.phones) {
      const cup = '#e0553f', cupLit = '#f4876b', band = '#5d648f';
      r(3, 0, 8, 1, band);
      if (dir === 'side') { r(5, 4, 3, 4, cup); r(5, 4, 1, 4, dim(cup, 0.3)); }
      else if (dir === 'up') { r(1, 1, 1, 3, band); r(12, 1, 1, 3, band); r(0, 4, 2, 4, cup); r(12, 4, 2, 4, cupLit); }
      else { r(1, 1, 1, 3, band); r(12, 1, 1, 3, band); r(0, 4, 2, 4, cup); r(12, 4, 2, 4, cupLit); }
    }
    if (look.halo) { r(3, 1, 8, 1, NAVY); r(3, 0, 8, 1, '#ffd95a'); r(8, 0, 3, 1, '#fff1b0'); }
  };

  if (dir === 'side') {
    const [back, front] = frame === 1 ? [3, 9] : frame === 2 ? [5, 7] : [5, 8];
    leg(back, false, pantsDim);
    leg(front, false, pants);
    r(4, 11, 6, 3, shirt);
    r(4, 11, 2, 3, shirtDim);
    r(9, 11, 1, 3, shirtLit);
    r(4, 14, 6, 1, pants);
    const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    r(6 + swing, 12, 2, 2, shirtDim);
    r(6 + swing, 14, 2, 1, skin);
    r(3, 10, 8, 1, NAVY);
    r(2, 5, 10, 4, skin);
    r(3, 9, 8, 1, skin);
    r(11, 5, 1, 4, skinLit);
    r(2, 5, 5, 4, hair);
    r(2, 5, 2, 4, hairDim);
    r(3, 9, 3, 1, hairDim);
    if (look.glasses) { // one lens at the front of the face, the arm back to the ear
      r(7, 6, 1, 1, NAVY);
      r(8, 6, 3, 2, '#d6ecf7');
    }
    r(9, 6, 1, 2, NAVY);
    hairTop();
    headgear();
    return;
  }

  leg(3, frame === 1, pantsDim);
  leg(9, frame === 2, pants);
  r(3, 11, 8, 1, shirt);
  r(2, 12, 10, 2, shirt);
  r(3, 11, 1, 1, shirtDim);
  r(2, 12, 2, 2, shirtDim);
  r(10, 11, 1, 1, shirtLit);
  r(10, 12, 2, 2, shirtLit);
  r(4, 14, 6, 1, shirtDim);
  r(5, 14, 4, 1, pants);
  r(2, 14, 2, 1, skinDim);
  r(10, 14, 2, 1, skinLit);
  r(3, 10, 8, 1, NAVY);

  if (dir === 'up') {
    r(2, 5, 10, 4, hair);
    r(2, 5, 3, 4, hairDim);
    r(9, 5, 3, 4, hairLit);
    r(3, 9, 8, 1, hairDim);
    if (look.hairStyle === 'long') { r(0, 3, 2, 8, hairDim); r(12, 3, 2, 8, hairLit); }
    if (look.hairStyle === 'puff') { r(0, 4, 2, 3, hairDim); r(12, 4, 2, 3, hairLit); }
    hairTop();
    headgear();
    return;
  }

  if (look.tie) { r(6, 11, 2, 1, '#c6303b'); r(6, 12, 2, 2, '#a82530'); }
  r(2, 5, 10, 4, skin);
  r(3, 9, 8, 1, skin);
  r(2, 6, 1, 3, skinDim);
  r(3, 8, 1, 2, skinDim);
  r(11, 5, 1, 4, skinLit);
  r(10, 8, 1, 2, skinLit);
  if (look.hairStyle === 'long' && !hat) {
    r(0, 3, 2, 8, hairDim);
    r(12, 3, 2, 8, hairLit);
    r(2, 5, 1, 4, NAVY);
    r(11, 5, 1, 4, NAVY);
  } else if (look.hairStyle === 'puff' && !hat) {
    r(0, 4, 2, 3, hairDim);
    r(12, 4, 2, 3, hairLit);
  } else if (!hat) {
    r(2, 5, 1, 2, hairDim);
  }
  if (look.halo) r(3, 8, 8, 2, '#f4efe6'); // the beard
  hairTop();
  headgear();

  let left = 5, right = 8;
  if (look.glasses) {
    r(3, 6, 3, 2, '#d6ecf7');
    r(8, 6, 3, 2, '#d6ecf7');
    r(6, 6, 2, 1, NAVY);
    left = 4;
    right = 9;
  }
  const blush = mix(skin, '#e8606a', 0.55);
  r(left, 6, 1, 2, NAVY);
  r(right, 6, 1, 2, NAVY);
  if (mood === 'happy') { // eyes stay open: closed ones read as asleep
    r(3, 8, 1, 1, blush);
    r(10, 8, 1, 1, blush);
  }
  if (mood === 'worried') {
    r(6, 9, 2, 1, NAVY);
    r(12, 5, 1, 2, '#7cc6ef');
  }
  if (open) {
    r(6, 8, 2, 2, NAVY);
    r(6, 9, 2, 1, '#d85a6a');
  }
}

const figure = (look, dir, frame, mood, open) => sprite(14, 18, (r) => paintPerson(r, look, dir, frame, mood, open), true, NAVY);

/** dir is down, up or side (facing right). frame is 0 stand, 1 and 2 stepping. */
export const personSprite = (look, dir, frame) => once(`p|${look.id}|${dir}|${frame}`, () => figure(look, dir, frame, 'neutral', false));

const portrait = (look, mood, open) => figure(look, 'down', 0, mood, open);

export const portraitUrl = (look, mood = 'neutral', open = false) => once(`u|${look.id}|${mood}|${open}`, () => portrait(look, mood, open).toDataURL());

const SEASONS = {
  spring: { grass: ['#6fb346', '#62a63f', '#559838', '#84c350'], leaves: ['#2f6b3f', '#3f8f45', '#5cae4c', '#f3a6bd'] },
  summer: { grass: ['#5fa53a', '#529734', '#458a2f', '#79ba45'], leaves: ['#27603a', '#367f3e', '#4f9e45', '#86c752'] },
  fall: { grass: ['#8f9c3c', '#7f8f36', '#6f8130', '#a6ad48'], leaves: ['#8a3f1f', '#c4602a', '#e4943a', '#f6c453'] },
  winter: { grass: ['#dfe9ee', '#cfdfe8', '#bcd2df', '#f2f7f8'], leaves: ['#2f5a52', '#3f7a66', '#6a9a86', '#e8f2f4'] },
};
export const seasonOf = (date) => ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'][date.getMonth()];

const oak = (leaves, seed) => sprite(36, 46, (r) => {
  const rand = seeded(seed);
  r(14, 34, 7, 11, '#7a4a28');
  r(14, 34, 2, 11, '#9b6638');
  r(19, 34, 2, 11, '#5a331d');
  r(11, 44, 13, 2, '#5a331d');
  disc(r, 18, 19, 16, leaves[0]);
  disc(r, 7, 25, 7, leaves[0]);
  disc(r, 29, 25, 7, leaves[0]);
  disc(r, 17, 16, 13, leaves[1]);
  disc(r, 8, 22, 5, leaves[1]);
  disc(r, 27, 22, 5, leaves[1]);
  for (let i = 0; i < 16; i++) disc(r, 8 + Math.floor(rand() * 18), 6 + Math.floor(rand() * 17), 1 + Math.floor(rand() * 2), leaves[2]);
  for (let i = 0; i < 12; i++) r(9 + Math.floor(rand() * 14), 5 + Math.floor(rand() * 12), 2, 1, leaves[3]);
});

const pine = (snow) => sprite(28, 48, (r) => {
  const ramp = ['#1f5140', '#2c6b4f', '#3f8a5e'];
  r(12, 40, 5, 8, '#6a4023');
  r(12, 40, 2, 8, '#8a5a32');
  [[30, 14, 0], [20, 11, 1], [11, 8, 2]].forEach(([top, half, tier]) => {
    for (let y = 0; y < 13; y++) {
      const w = Math.round((half * (y + 2)) / 13);
      r(14 - w, top + y - tier, w * 2, 1, ramp[0]);
      r(14 - w, top + y - tier, Math.max(1, w), 1, ramp[1]);
      if (y % 3 === 0) r(14 - w + 1, top + y - tier, Math.max(1, Math.floor(w * 0.6)), 1, snow ? '#eef6f8' : ramp[2]);
    }
  });
});

const bush = (leaves, seed) => sprite(18, 12, (r) => {
  const rand = seeded(seed);
  disc(r, 5, 7, 4, leaves[0]);
  disc(r, 12, 6, 5, leaves[0]);
  disc(r, 5, 6, 3, leaves[1]);
  disc(r, 11, 5, 4, leaves[1]);
  for (let i = 0; i < 6; i++) r(3 + Math.floor(rand() * 11), 3 + Math.floor(rand() * 5), 2, 1, leaves[2]);
});

const rock = (seed) => sprite(14, 9, (r) => {
  const s = seed % 2 ? '#8f8a84' : '#a39a8c';
  oval(r, 7, 5, 6, 3, dim(s, 0.2));
  oval(r, 6, 4, 5, 3, s);
  r(4, 2, 4, 1, lit(s, 0.4));
});

export const lamp = () => sprite(8, 30, (r) => {
  r(3, 8, 2, 20, '#4a3a44');
  r(1, 27, 6, 3, '#3a2e38');
  r(1, 1, 6, 8, '#3a2e38');
  r(2, 2, 4, 6, '#ffe39a');
  r(2, 0, 4, 1, '#3a2e38');
});

const board = () => sprite(38, 32, (r) => {
  r(3, 8, 3, 24, '#6a4023');
  r(32, 8, 3, 24, '#6a4023');
  r(0, 4, 38, 20, '#8a5530');
  r(0, 4, 38, 2, '#b07a45');
  r(2, 7, 34, 15, '#c9a064');
  r(4, 9, 9, 11, '#fbf1d6');
  r(5, 11, 7, 1, '#c6303b');
  r(5, 13, 7, 1, '#8a7a66');
  r(5, 15, 5, 1, '#8a7a66');
  r(15, 8, 9, 7, '#f6d97a');
  r(16, 10, 7, 1, '#8a7a66');
  r(26, 10, 9, 10, '#bfe0f0');
  r(27, 12, 7, 1, '#4a66c4');
  r(27, 14, 5, 1, '#4a66c4');
  r(16, 16, 8, 5, '#f4b6c7');
  r(0, 0, 38, 4, '#6d4226');
  r(0, 0, 38, 1, '#94603a');
});

const fountain = () => sprite(48, 32, (r) => {
  oval(r, 24, 24, 23, 7, '#7c766f');
  oval(r, 24, 22, 23, 7, '#a7a096');
  oval(r, 24, 22, 19, 5, '#4a9ccc');
  oval(r, 24, 21, 14, 3, '#6fbce0');
  r(22, 8, 5, 15, '#a7a096');
  r(22, 8, 2, 15, '#c6bfb3');
  r(26, 8, 1, 15, '#7c766f');
  oval(r, 24, 8, 8, 3, '#a7a096');
  oval(r, 24, 7, 6, 2, '#6fbce0');
  r(23, 1, 2, 5, '#bfe8f3');
});

export const mailbox = (flag) => once(`mail|${flag}`, () => sprite(9, 14, (r) => {
  r(4, 6, 2, 8, '#6a4023');
  rounded(r, 1, 0, 8, 7, '#c6d2dc');
  r(1, 5, 8, 2, '#8fa0b0');
  if (flag) { r(9, 0, 1, 4, '#c6303b'); r(7, 0, 2, 2, '#e0313f'); }
}));

const stake = () => sprite(24, 22, (r) => {
  r(10, 12, 3, 10, '#6a4023');
  r(0, 0, 24, 13, '#a8683a');
  r(0, 0, 24, 2, '#c98a4f');
  r(4, 5, 16, 1, '#5a331d');
  r(4, 8, 11, 1, '#5a331d');
});

const STATIONS = {
  bench: () => sprite(26, 20, (r) => {
    r(0, 6, 26, 4, '#b07a45'); r(0, 6, 26, 1, '#d09a60'); r(0, 10, 26, 2, '#7a4a28');
    r(2, 12, 4, 8, '#6a4023'); r(20, 12, 4, 8, '#6a4023');
    r(3, 2, 8, 4, '#8fa0b0'); r(4, 0, 6, 2, '#6a7a8a');
    r(15, 4, 9, 2, '#c6303b');
  }),
  music: () => sprite(22, 24, (r) => {
    r(0, 8, 14, 16, '#2f2838'); r(1, 9, 12, 2, '#6a6578');
    disc(r, 7, 17, 4, '#6a6578'); disc(r, 7, 17, 2, '#14121f');
    r(18, 4, 1, 20, '#3a2e38'); r(15, 22, 7, 2, '#3a2e38'); r(17, 0, 3, 5, '#c6c0d0');
  }),
  books: () => sprite(26, 16, (r) => {
    r(0, 4, 26, 3, '#b07a45'); r(0, 4, 26, 1, '#d09a60'); r(0, 7, 26, 3, '#7a4a28');
    r(2, 10, 3, 6, '#6a4023'); r(21, 10, 3, 6, '#6a4023');
    r(16, 0, 8, 2, '#2f4db0'); r(17, 2, 7, 2, '#c6303b');
  }),
  teach: () => sprite(26, 28, (r) => {
    r(0, 0, 26, 18, '#6a4023'); r(2, 2, 22, 14, '#27594a');
    r(4, 5, 12, 1, '#e8f2e0'); r(4, 8, 16, 1, '#e8f2e0'); r(4, 11, 9, 1, '#e8f2e0');
    r(4, 18, 3, 10, '#6a4023'); r(19, 18, 3, 10, '#6a4023');
  }),
  ledger: () => sprite(26, 18, (r) => {
    r(0, 6, 26, 3, '#b07a45'); r(0, 6, 26, 1, '#d09a60'); r(0, 9, 26, 2, '#7a4a28');
    r(2, 11, 3, 7, '#6a4023'); r(21, 11, 3, 7, '#6a4023');
    [[3, 3], [8, 1], [13, 4]].forEach(([x, top]) => { r(x, top, 4, 6 - top, '#e0ad45'); r(x, top, 4, 1, '#ffd95a'); });
    r(18, 2, 6, 4, '#2f7a3a'); r(18, 2, 6, 1, '#4f9e45');
  }),
  garden: () => sprite(26, 12, (r) => {
    r(0, 0, 26, 12, '#6a4427');
    for (let row = 0; row < 2; row++) {
      r(1, 3 + row * 6, 24, 2, '#533320');
      for (let x = 3; x < 24; x += 5) { r(x, 1 + row * 6, 1, 3, '#2f7a3a'); r(x - 1, 1 + row * 6, 3, 1, '#4f9e45'); }
    }
  }),
};

const picnic = () => sprite(30, 12, (r) => {
  r(0, 0, 30, 7, '#b07a45');
  for (let x = 7; x < 30; x += 7) r(x, 0, 1, 7, '#8a5a30');
  r(0, 0, 30, 1, '#d09a60');
  r(0, 7, 30, 2, '#7a4a28');
  r(3, 9, 3, 3, '#6a4023'); r(24, 9, 3, 3, '#6a4023');
  [5, 19].forEach((x) => { r(x, 2, 6, 3, '#fbf4e6'); r(x + 1, 3, 4, 1, '#e0553f'); r(x + 2, 2, 2, 1, '#86c752'); });
});

export const TABLES = [[-44, 30], [44, 30]];

/** Each cottage's job site, on the side away from the town square. */
export const stationOf = (plot) => {
  const side = plot.x <= 0 ? -1 : 1;
  return { x: plot.x + side * 54, y: plot.y + 8, side };
};

const boat = (stripe) => sprite(34, 28, (r) => {
  r(16, 2, 2, 18, '#6a4023');
  for (let y = 0; y < 15; y++) r(18, 3 + y, 1 + Math.floor(y * 0.85), 1, y % 5 === 0 ? stripe : '#fff4dc');
  for (let y = 0; y < 11; y++) r(15 - Math.floor(y * 0.65), 6 + y, 1 + Math.floor(y * 0.65), 1, '#f0e4c8');
  r(3, 20, 28, 3, '#a8683a');
  r(5, 23, 24, 2, '#7a4a28');
  r(8, 25, 18, 2, '#5a331d');
  r(3, 20, 28, 1, '#d09a60');
});

/** The jetty on the east shore. Everything is relative to the island's centre. */
export const dockOf = (rx) => {
  const x = rx - 104, y = 112, w = 87;
  // Boats tie up clear of the planks: the reporter's along the north side, Jobs' off the far end.
  return { x, y, w, boats: [{ x: x + w - 14, y: y - 3 }, { x: x + w + 19, y: y + 13 }], news: { x: x + w - 36, y: y + 9 }, bundle: { x: x + w - 20, y: y + 10 }, stall: { x: x + 14, y: y + 7 }, desk: { x: x + 32, y: y + 9 } };
};

const jetty = (w) => sprite(w, 24, (r) => {
  for (let x = 6; x < w - 2; x += 24) { r(x, 12, 4, 12, '#5a331d'); r(x, 12, 1, 12, '#7a4a28'); }
  r(0, 0, w, 13, '#b07a45');
  for (let x = 5; x < w; x += 6) r(x, 0, 1, 13, '#8a5a30');
  r(0, 0, w, 1, '#d09a60');
  r(0, 12, w, 1, '#7a4a28');
});

const jobBoard = () => sprite(22, 22, (r) => {
  r(2, 8, 2, 14, '#6a4023'); r(18, 8, 2, 14, '#6a4023');
  r(0, 0, 22, 16, '#8a5530'); r(0, 0, 22, 1, '#b07a45');
  r(2, 2, 18, 12, '#c9a064');
  r(3, 3, 7, 5, '#fbf1d6'); r(4, 5, 5, 1, '#8a7a66');
  r(12, 3, 7, 7, '#bfe0f0'); r(13, 5, 5, 1, '#4a66c4'); r(13, 7, 4, 1, '#4a66c4');
  r(4, 9, 6, 4, '#f6d97a'); r(5, 11, 4, 1, '#8a7a66');
});

const newsBundle = () => sprite(12, 9, (r) => {
  r(0, 2, 12, 7, '#f6ecd8');
  for (let y = 3; y < 9; y += 2) r(0, y, 12, 1, '#c6c0b0');
  r(5, 0, 2, 9, '#a8683a');
  r(1, 0, 10, 2, '#fbf4e6'); r(2, 1, 8, 1, '#c6303b');
});

const CLOUD_W = '#fff8e4', CLOUD_S = '#f0d8a4';
const godCloud = () => sprite(70, 26, (r) => {
  oval(r, 34, 17, 32, 7, CLOUD_S);
  disc(r, 20, 12, 10, CLOUD_W);
  disc(r, 38, 9, 9, CLOUD_W);
  disc(r, 52, 13, 8, CLOUD_W);
  oval(r, 34, 15, 31, 5, CLOUD_W);
  r(14, 6, 10, 1, '#ffffff');
  r(32, 3, 10, 1, '#ffffff');
}, true);

/** A cottage. Manager gets the big one. windows are in sprite pixels, so the frame can light them. */
export function houseSprite(look, big) {
  return once(`h|${look.id}|${big}`, () => {
    const W = big ? 96 : 66, H = big ? 88 : 64, wallH = big ? 38 : 26, top = 8, eave = H - wallH;
    const roof = { hi: lit(look.wall, 0.22), mid: look.wall, lo: dim(look.wall, 0.22), dk: dim(look.wall, 0.5) };
    const windows = [];
    const chX = W - (big ? 30 : 20);
    const glassAt = (r, x, y, w, h) => {
      r(x - 1, y - 1, w + 2, h + 2, '#f3e3bd');
      r(x, y, w, h, '#9bd7ec');
      r(x, y, 2, 1, '#d8f2fa');
      r(x + (w >> 1), y, 1, h, '#f3e3bd');
      r(x, y + (h >> 1), w, 1, '#f3e3bd');
      windows.push({ x: x + 1, y: y + 1, w, h });
    };
    const c = sprite(W, H, (r) => {
      r(chX, 1, 9, 18, '#8a5a4a');
      r(chX, 1, 9, 2, '#b07a62');
      r(chX + 7, 3, 2, 16, '#6e4238');
      r(chX - 1, 0, 11, 2, '#6e4238');

      const wx = 6, ww = W - 12;
      if (look.pattern === 1) {
        for (let y = eave; y < H; y += 3) r(wx, y, ww, 3, (y - eave) % 6 === 0 ? '#c08a50' : '#ad7842');
        for (let y = eave + 2; y < H; y += 3) r(wx, y, ww, 1, '#7f5430');
      } else if (look.pattern === 2) {
        r(wx, eave, ww, H - eave, '#a39b90');
        for (let y = eave, row = 0; y < H; y += 5, row++) {
          for (let x = wx - (row % 2 ? 4 : 0); x < wx + ww; x += 9) {
            r(Math.max(wx, x), y, 1, 5, '#7c766f');
            if ((x + y) % 3 === 0) r(Math.max(wx, x) + 2, y + 1, 5, 3, '#b5ada1');
          }
          r(wx, y, ww, 1, '#7c766f');
        }
      } else {
        r(wx, eave, ww, H - eave, '#efdcb2');
        r(wx, eave, 3, H - eave, '#7a4a28');
        r(wx + ww - 3, eave, 3, H - eave, '#7a4a28');
        r(wx, eave + (wallH >> 1), ww, 2, '#7a4a28');
        r(wx + 3, eave + 2, ww - 6, 1, '#fbecc8');
      }
      r(wx, H - 3, ww, 3, '#7c766f');
      r(wx, H - 3, ww, 1, '#a7a096');

      const winY = big ? eave + 6 : eave + 7;
      const winW = big ? 14 : 12, winH = big ? 12 : 9;
      const xs = big ? [14, 66] : [12, W - 24];
      xs.forEach((x) => {
        glassAt(r, x, winY, winW, winH);
        r(x - 2, winY + winH + 1, winW + 4, 3, '#8a5a30');
        for (let i = 0; i < winW; i += 3) r(x + i, winY + winH, 2, 1, i % 6 ? '#e0553f' : '#ffd95a');
      });
      const dw = big ? 16 : 12, dh = big ? 22 : 18, dx = (W - dw) >> 1;
      r(dx - 2, H - dh - 2, dw + 4, dh + 2, '#6a4023');
      r(dx, H - dh, dw, dh, dim(look.wall, 0.2));
      for (let x = dx + 3; x < dx + dw; x += 4) r(x, H - dh, 1, dh, dim(look.wall, 0.42));
      r(dx + 3, H - dh + 3, dw - 6, 4, '#9bd7ec');
      r(dx + dw - 3, H - 9, 2, 2, '#ffd95a');
      if (big) {
        r(dx - 1, H - dh - 5, dw + 2, 3, roof.lo);
      }

      for (let y = top; y < eave + 3; y++) {
        const inset = Math.round((eave + 3 - y) * 0.28);
        const band = Math.floor((y - top) / 4);
        const shadeBand = y - top < 8 ? roof.hi : y > eave - 3 ? roof.lo : roof.mid;
        r(inset, y, W - inset * 2, 1, (y - top) % 4 === 3 ? roof.lo : shadeBand);
        if ((y - top) % 4 !== 3) {
          for (let x = inset + (band % 2 ? 3 : 0); x < W - inset; x += 6) r(x, y, 1, 1, roof.lo);
        }
      }
      r(Math.round((eave + 3 - top) * 0.28), top, W - Math.round((eave + 3 - top) * 0.28) * 2, 2, roof.hi);
      r(0, eave + 2, W, 1, roof.dk);
      r(6, eave + 3, W - 12, 2, 'rgba(50,20,40,.32)');

      if (big) {
        [28, 58].forEach((x) => {
          r(x - 3, 25, 18, 17, '#efdcb2');
          r(x - 5, 22, 22, 3, roof.lo);
          r(x - 3, 21, 18, 1, roof.hi);
          glassAt(r, x, 28, 12, 10);
        });
        r(W >> 1, 0, 1, 12, '#6a4023');
        r((W >> 1) + 1, 1, 10, 6, '#d9694a');
        r((W >> 1) + 1, 3, 10, 2, '#ffd95a');
      }
    });
    return { c, W: W + 2, H: H + 2, windows, chimney: { x: chX + 5, y: 0 } };
  });
}

/** Evenly spread on the land. Past the hand-placed plots, new houses push the island wider. */
const PLOTS = [[-150, -52], [150, -52], [-236, 26], [236, 26], [-112, 112], [112, 112], [0, 142]];
export function plotOf(i) {
  if (i < PLOTS.length) return { x: PLOTS[i][0], y: PLOTS[i][1] };
  const n = i - PLOTS.length;
  const side = n % 2 ? 1 : -1;
  const column = Math.floor(n / 4);
  return { x: side * (340 + column * 86), y: n % 4 < 2 ? -30 : 62 };
}

const GRASS = 1, SAND = 2, PATH = 3, STONE = 4, WATER = 5;
// Placed by hand around the plots, clear of doors, paths and the shore. A slot a new house lands on is skipped.
const TREE_SLOTS = [[-210, -85], [-255, -54], [210, -85], [268, -62], [290, -14], [-175, 72], [-232, 100], [-32, 88], [28, 94], [-20, 132], [46, 134], [185, 78], [196, 124]];
const PLAZA_RX = 74, PLAZA_RY = 40;

function pointSegment(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

/** The edge of the plaza nearest a door. Residents walk these spokes, so nobody crosses a house. */
export function spokeEnd(door) {
  const len = Math.hypot(door.x / PLAZA_RX, door.y / PLAZA_RY) || 1;
  return { x: (door.x / len) * 0.92, y: (door.y / len) * 0.92 };
}

/** Bakes the ground and places every prop. Slow, so it runs once per window size and resident list. */
export function buildIsland(view, plots, season, vacant) {
  const { LW, LH, cx, cy, rx, ry } = view;
  const c = make(LW, LH);
  const g = c.getContext('2d');
  const im = g.createImageData(LW, LH);
  const kind = new Uint8Array(LW * LH);
  const { grass, leaves } = SEASONS[season];
  const G = grass.map(rgb);
  const paint = (i, col) => { im.data[i * 4] = col[0]; im.data[i * 4 + 1] = col[1]; im.data[i * 4 + 2] = col[2]; im.data[i * 4 + 3] = 255; };
  const tone = (hexes) => hexes.map(rgb);
  const SEA = tone(['#2a6fa8', '#2f7eb8', '#3a92c8', '#58b4d8', '#d8f2f4']);
  const BEACH = tone(['#c7a564', '#ecd08f', '#f4dfa4', '#dcb972']);
  const DIRT = tone(['#c99a5b', '#b98a4d', '#d8ad70', '#8d6236']);
  const STONES = tone(['#b2aa9c', '#a39b8e', '#c0b8aa', '#7f786e']);
  const DARK = rgb(season === 'winter' ? '#a8c2d2' : '#3f7a2f');

  const segments = plots.map((p) => {
    const door = { x: p.x, y: p.y + 6 };
    const end = spokeEnd(door);
    return { x1: door.x + cx, y1: door.y + cy, x2: end.x + cx, y2: end.y + cy };
  });
  const dock = dockOf(rx);
  // The dock hangs off the nearest door, so it's never cut off from the island.
  const gap = (p) => Math.hypot(p.x - dock.x, p.y - dock.y);
  const nearest = plots.reduce((a, b) => (a && gap(a) <= gap(b) ? a : b), null);
  if (nearest) segments.push({ x1: nearest.x + cx, y1: nearest.y + 6 + cy, x2: dock.x + 4 + cx, y2: dock.y + 7 + cy });

  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const i = y * LW + x;
      const qx = x & ~1, qy = y & ~1;
      const d = (Math.abs((qx - cx) / rx) ** 2.4 + Math.abs((qy - cy) / ry) ** 2.4) ** (1 / 2.4);
      const v = 1 - d + (fbm((qx - cx) * 0.03, (qy - cy) * 0.03) - 0.5) * 0.14; // measured from the centre, so the coast is the same at any window size
      if (v < 0) {
        const ripple = smooth(x * 0.05, y * 0.32) * 0.03;
        const depth = -v + ripple;
        kind[i] = WATER;
        paint(i, depth < 0.018 ? SEA[4] : depth < 0.05 ? SEA[3] : depth < 0.11 ? SEA[2] : depth < 0.2 ? SEA[1] : SEA[0]);
      } else if (v < 0.018) {
        kind[i] = SAND;
        paint(i, BEACH[0]);
      } else if (v < 0.07) {
        kind[i] = SAND;
        const n = grain(x, y);
        paint(i, n > 0.93 ? BEACH[3] : n < 0.07 ? BEACH[2] : BEACH[1]);
      } else {
        const px = (x - cx) / PLAZA_RX, py = (y - cy) / PLAZA_RY;
        const inPlaza = px * px + py * py;
        const wobble = fbm(x * 0.09, y * 0.09) * 3;
        let near = Infinity;
        if (inPlaza > 0.8) for (const s of segments) near = Math.min(near, pointSegment(x, y, s));
        if (inPlaza < 1) {
          kind[i] = STONE;
          const row = Math.floor(y / 6);
          const cell = Math.floor((x + (row % 2) * 5) / 10);
          const mortar = y % 6 === 0 || (x + (row % 2) * 5) % 10 === 0;
          const edge = inPlaza > 0.86;
          paint(i, mortar ? STONES[3] : edge ? STONES[1] : STONES[Math.floor(grain(cell, row) * 3)]);
        } else if (near < 5 + wobble) {
          kind[i] = PATH;
          const n = grain(x, y);
          paint(i, n > 0.93 ? DIRT[2] : n < 0.1 ? DIRT[1] : DIRT[0]);
        } else if (near < 6.5 + wobble) {
          kind[i] = PATH;
          paint(i, DIRT[3]);
        } else {
          kind[i] = GRASS;
          if (v < 0.082) paint(i, DARK);
          else {
            const clump = smooth(x * 0.24, y * 0.24) * 0.62 + smooth(x * 0.8 + 9, y * 0.8) * 0.38 + (fbm(x * 0.02, y * 0.02) - 0.5) * 0.4;
            paint(i, G[clump > 0.62 ? 3 : clump > 0.48 ? 0 : clump > 0.36 ? 1 : 2]);
          }
        }
      }
    }
  }
  g.putImageData(im, 0, 0);

  const rand = seeded(9187);
  const kindAt = (x, y) => (x >= 0 && y >= 0 && x < LW && y < LH ? kind[y * LW + x] : 0);
  const dot = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let i = 0; i < LW * LH * 0.012; i++) {
    const x = Math.floor(rand() * LW), y = Math.floor(rand() * LH);
    const here = kindAt(x, y);
    if (here === GRASS) {
      const roll = rand();
      if (roll < 0.62) { dot(x, y, 1, 2, grass[3]); dot(x + 2, y, 1, 2, grass[3]); dot(x + 1, y + 1, 1, 2, grass[2]); }
      else if (roll < 0.8 && season !== 'winter') {
        const petal = ['#fff4d8', '#ffd95a', '#f08aa8', '#c58be0'][Math.floor(rand() * 4)];
        dot(x + 1, y, 1, 3, petal);
        dot(x, y + 1, 3, 1, petal);
        dot(x + 1, y + 1, 1, 1, '#e8a22a');
      }
    } else if (here === SAND && rand() < 0.2) {
      dot(x, y, 2, 1, '#fff6dc');
    } else if (here === PATH && rand() < 0.3) {
      dot(x, y, 2, 1, '#a07543');
    }
  }

  // The boats' moorings count too, so no rock or sparkle ends up under them.
  for (let y = dock.y - 14; y < dock.y + 16; y++) for (let x = dock.x; x < dock.x + dock.w + 36; x++) kind[(y + cy) * LW + x + cx] = PATH;
  g.drawImage(once(`jetty|${dock.w}`, () => jetty(dock.w)), cx + dock.x - 1, cy + dock.y - 1);

  // Garden plots on the two open flanks of the manor.
  [[cx - 88, cy - 118], [cx + 52, cy - 118]].forEach(([gx, gy]) => {
    dot(gx, gy, 38, 22, '#6a4427');
    for (let row = 0; row < 3; row++) {
      dot(gx + 2, gy + 3 + row * 7, 34, 3, '#533320');
      for (let x = 4; x < 34; x += 6) {
        dot(gx + x, gy + 1 + row * 7, 1, 3, leaves[1]);
        dot(gx + x - 1, gy + 1 + row * 7, 3, 1, leaves[2]);
      }
    }
  });

  const sparkles = [];
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rand() * LW), y = Math.floor(rand() * LH);
    if (kindAt(x, y) === WATER) sparkles.push({ x, y, w: 2 + Math.floor(rand() * 4) });
  }

  const blocked = [...plots, vacant].map((p) => ({ x: p.x + cx, y: p.y + cy, w: p.big ? 62 : 46, h: p.big ? 96 : 76 }));
  [[-69, -96], [71, -96]].forEach(([dx, dy]) => blocked.push({ x: cx + dx, y: cy + dy, w: 34, h: 30 }));
  const cottages = plots.filter((p) => !p.big);
  const stalls = cottages.filter((p) => p.job !== 'dock'); // Jobs works on the dock
  stalls.forEach((p) => { const st = stationOf(p); blocked.push({ x: st.x + cx, y: st.y + cy, w: 30, h: 34 }); });
  const props = [];
  const underCanopy = (p, x, y) => p.tall && Math.abs(p.x - x) < 28 && y > p.y - 52 && y < p.y + 6;
  const clear = (x, y, gap) => blocked.every((b) => Math.abs(x - b.x) > b.w || y < b.y - b.h || y > b.y + 56)
    && props.every((p) => Math.hypot(p.x - x, (p.y - y) * 1.4) > gap && !underCanopy(p, x, y));
  const onGrass = (x, y) => kindAt(x, y) === GRASS && kindAt(x - 12, y) === GRASS && kindAt(x + 12, y) === GRASS && kindAt(x, y + 6) === GRASS;
  const free = (x, y) => {
    const px = (x - cx) / (PLAZA_RX + 18), py = (y - cy) / (PLAZA_RY + 14);
    const topY = (y - 34 - cy) / (PLAZA_RY + 14);
    return px * px + py * py > 1 && px * px + topY * topY > 1 && segments.every((s) => pointSegment(x, y, s) > 15 && pointSegment(x, y - 26, s) > 10);
  };

  // One try per cell of a grid laid over the island, not the window, so bushes spread evenly and stay put at any size.
  const scatter = (cellW, cellH, gap, reach, limit, build) => {
    const cells = [];
    for (let gy = -ry; gy < ry; gy += cellH) for (let gx = -rx; gx < rx; gx += cellW) cells.push({ gx, gy, order: rand() });
    let placed = 0;
    cells.sort((a, b) => a.order - b.order).forEach(({ gx, gy }) => {
      for (let tries = 0; tries < 8 && placed < limit; tries++) {
        const x = cx + gx + Math.floor(rand() * cellW), y = cy + gy + Math.floor(rand() * cellH);
        if (onGrass(x, y) && kindAt(x, y - reach) === GRASS && free(x, y) && clear(x, y, gap)) {
          props.push({ x, y, c: build() });
          placed++;
          return;
        }
      }
    });
  };
  TREE_SLOTS.forEach(([dx, dy], i) => {
    const x = cx + dx, y = cy + dy;
    if (onGrass(x, y) && free(x, y) && clear(x, y, 40)) props.push({ x, y, tall: true, c: once(`tree|${season}|${i % 5}`, () => (i % 5 === 4 ? pine(season === 'winter') : oak(leaves, i % 4 + 1))) });
  });
  scatter(54, 44, 24, 0, 14, () => {
    const seed = Math.floor(rand() * 3);
    return once(`bush|${season}|${seed}`, () => bush(leaves, seed + 11));
  });
  for (let i = 0; i < 500; i++) {
    const x = Math.floor(rand() * LW), y = Math.floor(rand() * LH);
    if ((kindAt(x, y) === SAND || (kindAt(x, y) === WATER && rand() < 0.04)) && props.every((p) => Math.hypot(p.x - x, p.y - y) > 40) && rand() < 0.1) {
      const seed = Math.floor(rand() * 2);
      props.push({ x, y, c: once(`rock|${seed}`, () => rock(seed)) });
    }
  }
  props.push({ x: cx, y: cy + 8, c: once('fountain', fountain), fountain: true });
  props.push({ x: cx + vacant.x, y: cy + vacant.y - 6, c: once('stake', stake) });
  stalls.forEach((p) => {
    const st = stationOf(p);
    props.push({ x: cx + st.x, y: cy + st.y, c: once(`station|${p.job}`, STATIONS[p.job]) });
  });
  props.push({ x: cx + dock.stall.x, y: cy + dock.stall.y, c: once('jobBoard', jobBoard) });
  props.push({ x: cx + dock.bundle.x, y: cy + dock.bundle.y, c: once('newsBundle', newsBundle) });
  TABLES.forEach(([x, y]) => props.push({ x: cx + x, y: cy + y, c: once('picnic', picnic) }));
  props.push({ x: cx - 52, y: cy - 16, c: once('board', board) });
  [[-68, 26], [68, 26], [68, -18]].forEach(([dx, dy]) => props.push({ x: cx + dx, y: cy + dy, c: once('lamp', lamp), light: true }));

  const stripes = ['#e0553f', '#4a66c4'];
  const boats = dock.boats.map((b, i) => ({ x: cx + b.x, y: cy + b.y, c: once(`boat|${i}`, () => boat(stripes[i])) }));
  return { base: c, props, sparkles, boats, cloud: once('godCloud', godCloud) };
}

const drawAt = (g, c, x, y, flip) => {
  if (flip) {
    g.save();
    g.translate(Math.round(x), 0);
    g.scale(-1, 1);
    g.drawImage(c, -(c.width >> 1), Math.round(y) - c.height);
    g.restore();
  } else g.drawImage(c, Math.round(x) - (c.width >> 1), Math.round(y) - c.height);
};

const TINT = { dawn: '#ffcfb4', dusk: '#f2a27e', night: '#7f8fd0' };
const ZED = [[0, 0, 5, 1], [3, 1, 2, 1], [2, 2, 2, 1], [1, 3, 2, 1], [0, 4, 5, 1]];

/** The small signs of what someone is up to: sparks, notes, crumbs. */
function drawFx(g, a, ms) {
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const beat = Math.floor(ms / 280);
  const facing = a.flip ? -1 : 1;
  const { x, y } = a;
  if (a.fx === 'bench' && beat % 2) {
    [[0, 0], [3, -2], [-2, -3], [4, 1]].forEach(([dx, dy], i) => { if ((beat + i) % 3) px(a.st.x + dx, a.st.y - 12 + dy, 1, 1, '#ffd95a'); });
  } else if (a.fx === 'music') {
    [0, 0.5].forEach((lag) => {
      const t = (ms / 1400 + lag) % 1;
      const nx = x + facing * 2 + Math.sin(t * 6) * 3, ny = y - 25 - t * 14;
      px(nx, ny, 1, 4, NAVY); px(nx - 2, ny + 3, 3, 2, NAVY); px(nx + 1, ny, 2, 1, NAVY);
    });
  } else if (a.fx === 'books') {
    px(x - 4, y - 9, 8, 4, '#fbf4e6'); px(x, y - 9, 1, 4, '#8a7a66');
    if (beat % 4 === 0) px(x + 1, y - 9, 3, 1, '#c6c0b0');
  } else if (a.fx === 'teach') {
    px(a.st.x - 8, a.st.y - 15, beat % 15, 1, '#ffffff');
  } else if (a.fx === 'garden') {
    [0, 1, 2].forEach((i) => px(a.st.x - 7 + i * 7, a.st.y - 14 + ((ms / 45 + i * 6) % 9), 1, 2, '#6fbce0'));
  } else if (a.fx === 'board') {
    px(x - 5 + (beat % 3) * 5, y - 24, 2, 2, '#d9313f');
  } else if (a.fx === 'eat' && a.dir === 'down') {
    if (beat % 2) px(x + (beat % 4 === 1 ? 2 : -3), y - 10, 1, 1, '#e8c27a');
  } else if (a.fx === 'chat' && Math.floor(ms / 900 + a.seed) % 2) {
    px(x - 5, y - 30, 11, 7, NAVY);
    px(x - 4, y - 29, 9, 5, '#ffffff');
    px(x, y - 23, 1, 2, NAVY);
    [-2, 0, 2].forEach((dx) => px(x + dx, y - 27, 1, 1, NAVY));
  }
}

const glow = (g, x, y, rad, col) => {
  g.fillStyle = col;
  const tall = Math.round(rad * 0.8);
  for (let i = -tall; i <= tall; i++) {
    const half = Math.floor(rad * 1.25 * Math.sqrt(1 - (i * i) / (tall * tall)));
    g.fillRect(x - half, y + i, half * 2 + 1, 1);
  }
};

/** One frame of the island. Everything that stands on the ground is sorted by its feet. */
export function drawIsland(g, world, actors, phase, ms, trips = []) {
  g.imageSmoothingEnabled = false;
  g.drawImage(world.base, 0, 0);
  const beat = Math.floor(ms / 420);
  g.fillStyle = '#e4f7fb';
  world.sparkles.forEach((p, i) => { if ((beat + i * 3) % 6 === 0) g.fillRect(p.x, p.y, p.w, 1); });

  const bob = Math.sin(ms / 900) > 0 ? 1 : 0;
  // Out past the edge of the map and back. Whoever is on the trip stands on deck.
  world.boats.forEach((b, i) => {
    const trip = trips[i] ?? { t: 0 };
    const x = b.x + (g.canvas.width + 40 - b.x) * trip.t;
    drawAt(g, b.c, x, b.y + bob, trip.flip);
    if (trip.t > 0) drawAt(g, trip.rider, x + (trip.flip ? 9 : -9), b.y + bob - 7, trip.flip);
  });

  const items = [...world.props, ...actors].sort((a, b) => a.y - b.y);
  items.forEach((it) => {
    if (it.house) {
      const { sprite: h, status, x, y } = it;
      g.drawImage(h.c, x - (h.W >> 1), y - h.H);
      h.windows.forEach((w) => {
        if (status.windows === 'plain') return;
        const left = x - (h.W >> 1) + w.x, top = y - h.H + w.y;
        g.fillStyle = status.windows === 'lit' ? '#ffd873' : '#3d4a66';
        g.fillRect(left, top, w.w, w.h);
        g.fillStyle = '#f3e3bd';
        g.fillRect(left + (w.w >> 1), top, 1, w.h);
        g.fillRect(left, top + (w.h >> 1), w.w, 1);
      });
      drawAt(g, mailbox(status.mail), x + (h.W >> 1) - 8, y + 6);
      if (status.boxes) {
        g.fillStyle = OUT;
        g.fillRect(x + 12, y - 2, 12, 9);
        g.fillStyle = '#c79a5b';
        g.fillRect(x + 13, y - 1, 10, 7);
        g.fillStyle = '#e8d6a8';
        g.fillRect(x + 17, y - 1, 2, 7);
      }
      return;
    }
    drawAt(g, it.c, it.x, it.y, it.flip);
    if (it.fountain) {
      g.fillStyle = '#d8f4fb';
      const drip = beat % 3;
      g.fillRect(it.x - 7 - drip, it.y - 22 + drip * 3, 1, 2);
      g.fillRect(it.x + 7 + drip, it.y - 22 + drip * 3, 1, 2);
    }
  });

  // Smoke and snores, drawn above the houses.
  actors.filter((a) => a.house).forEach((a) => {
    const chimneyX = a.x - (a.sprite.W >> 1) + a.sprite.chimney.x;
    const chimneyY = a.y - a.sprite.H + a.sprite.chimney.y;
    if (a.status.smoke) {
      for (let i = 0; i < 3; i++) {
        const t = ((ms / 1500 + i / 3) % 1);
        g.fillStyle = `rgba(240,240,250,${(0.8 * (1 - t)).toFixed(2)})`;
        const size = 2 + Math.round(t * 4);
        g.fillRect(Math.round(chimneyX + t * 10), Math.round(chimneyY - 2 - t * 26), size, size);
      }
    }
    if (a.status.zzz) {
      const rise = Math.floor(ms / 500) % 4;
      g.fillStyle = '#fff';
      ZED.forEach(([x, y, w, h]) => g.fillRect(chimneyX - 18 + x, chimneyY + 2 - rise + y, w, h));
    }
  });

  if (phase === 'day' || phase === 'dawn') {
    g.fillStyle = 'rgba(30, 30, 80, .07)';
    [0, 1].forEach((i) => {
      const x = ((ms / (90 + i * 50) + i * 400) % (g.canvas.width + 200)) - 100;
      for (let r = -14; r <= 14; r++) {
        const half = Math.floor(Math.sqrt(196 - r * r) * 3.4);
        g.fillRect(Math.round(x - half), 110 + i * 120 + r, half * 2, 1);
      }
    });
  }

  if (TINT[phase]) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = TINT[phase];
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.globalCompositeOperation = 'lighter';
    const col = phase === 'night' ? 'rgba(255,190,90,.16)' : 'rgba(255,190,90,.07)';
    world.props.filter((p) => p.light).forEach((p) => { glow(g, p.x, p.y - 26, 20, col); glow(g, p.x, p.y - 26, 11, col); });
    actors.filter((a) => a.house && a.status.windows === 'lit').forEach((a) => {
      a.sprite.windows.forEach((w) => glow(g, a.x - (a.sprite.W >> 1) + w.x + (w.w >> 1), a.y - a.sprite.H + w.y + 5, 8, col));
    });
    g.globalCompositeOperation = 'source-over';
  }

  // Last, so evening light doesn't muddy them.
  actors.filter((a) => a.fx).forEach((a) => drawFx(g, a, ms));
}

export const drawGod = (g, world, look, x, y, ms) => {
  const bob = Math.sin(ms / 1100) > 0 ? 1 : 0;
  drawAt(g, world.cloud, x, y + bob);
  drawAt(g, personSprite(look, 'down', 0), x, y - 12 + bob);
};

const WALL_H = 54;
const SKY = { dawn: '#ffb79f', day: '#8fd3f0', dusk: '#f08f6a', night: '#1c2358' };

const bed = (look) => sprite(46, 42, (r) => {
  const blanket = look.shirt === '#f2ead8' ? '#2f4db0' : look.shirt;
  r(0, 0, 46, 18, '#7a4a28');
  r(0, 0, 46, 2, '#a8683a');
  r(2, 14, 42, 22, '#efe6d0');
  r(8, 12, 30, 9, '#fffdf5');
  r(8, 19, 30, 2, '#ddd2bb');
  r(2, 22, 42, 15, blanket);
  r(2, 22, 42, 2, lit(blanket, 0.35));
  for (let x = 6; x < 44; x += 10) r(x, 25, 5, 3, dim(blanket, 0.22));
  r(2, 34, 42, 3, dim(blanket, 0.3));
  r(0, 37, 46, 5, '#7a4a28');
  r(0, 37, 46, 1, '#a8683a');
});

const shelf = (seed) => sprite(32, 50, (r) => {
  const rand = seeded(seed);
  r(0, 0, 32, 50, '#7a4a28');
  r(0, 0, 32, 2, '#a8683a');
  const spines = ['#c6303b', '#2f4db0', '#f0a12a', '#17806f', '#875aa3', '#f2ead8'];
  [3, 18, 33].forEach((y) => {
    r(2, y, 28, 13, '#4a2c20');
    for (let x = 3; x < 28;) {
      const w = 2 + Math.floor(rand() * 3);
      const h = 8 + Math.floor(rand() * 4);
      r(x, y + 13 - h, w, h, spines[Math.floor(rand() * spines.length)]);
      x += w + 1;
    }
  });
});

const desk = () => sprite(58, 40, (r) => {
  r(20, 0, 24, 18, '#2f2838');
  r(22, 2, 20, 14, '#38506b');
  r(30, 18, 8, 3, '#2f2838');
  r(26, 21, 16, 1, '#2f2838');
  r(0, 22, 58, 4, '#b07a45');
  r(0, 22, 58, 1, '#d09a60');
  r(0, 26, 58, 2, '#7a4a28');
  r(2, 28, 5, 12, '#6a4023');
  r(51, 28, 5, 12, '#6a4023');
  r(8, 18, 8, 4, '#f6ecd8');
  r(9, 19, 5, 1, '#8a7a66');
  r(48, 15, 4, 7, '#c6303b');
});

const chair = () => sprite(18, 26, (r) => {
  r(2, 0, 14, 14, '#26262e');
  r(2, 0, 14, 2, '#40404c');
  r(0, 14, 18, 5, '#2f2f38');
  r(0, 14, 18, 1, '#4a4a58');
  r(8, 19, 2, 5, '#8a8f99');
  r(2, 24, 14, 2, '#5a5f6a');
});

const barrel = () => sprite(14, 18, (r) => {
  r(0, 2, 14, 14, '#8a5530');
  r(0, 0, 14, 2, '#a8683a');
  r(0, 16, 14, 2, '#6a4023');
  r(0, 5, 14, 1, '#3a2e38');
  r(0, 12, 14, 1, '#3a2e38');
  r(2, 2, 2, 14, '#a8683a');
});

const ropeCoil = () => sprite(14, 8, (r) => {
  oval(r, 7, 4, 6, 3, '#c9a064');
  oval(r, 7, 4, 4, 2, '#a8844a');
  oval(r, 7, 4, 2, 1, '#c9a064');
});

const harp = () => sprite(16, 26, (r) => {
  r(1, 0, 3, 26, '#e0ad45');
  r(1, 0, 14, 3, '#e0ad45');
  r(12, 3, 3, 6, '#e0ad45');
  for (let i = 0; i < 5; i++) r(5 + i * 2, 3, 1, 20 - i * 3, '#fff1b0');
  r(0, 24, 10, 2, '#c98a1e');
});

const credenza = () => sprite(64, 20, (r) => {
  r(0, 6, 64, 14, '#3a2a22');
  r(0, 6, 64, 2, '#5a4030');
  r(2, 10, 28, 8, '#2f2019');
  r(34, 10, 28, 8, '#2f2019');
  r(14, 13, 4, 1, '#c9a064');
  r(46, 13, 4, 1, '#c9a064');
  r(4, 0, 3, 6, '#c6303b'); r(7, 1, 3, 5, '#2f4db0'); r(10, 0, 2, 6, '#f0a12a');
  r(48, 1, 6, 5, '#e8e2d0'); r(50, 0, 2, 1, '#e0553f');
});

const easel = () => sprite(40, 40, (r) => {
  r(6, 20, 2, 20, '#5a5f6a'); r(32, 20, 2, 20, '#5a5f6a');
  r(0, 0, 40, 26, '#c6ccd4');
  r(2, 2, 36, 22, '#ffffff');
  r(5, 6, 18, 1, '#2f4db0'); r(5, 10, 24, 1, '#2f4db0'); r(5, 14, 12, 1, '#c6303b'); r(22, 16, 10, 5, '#3aa39a');
});

const waterCooler = () => sprite(12, 32, (r) => {
  r(2, 0, 8, 10, '#9fd3f0'); r(2, 0, 3, 10, '#c8ecf7');
  r(0, 10, 12, 22, '#dfe6ee'); r(0, 10, 12, 2, '#ffffff');
  r(3, 16, 2, 2, '#4a66c4'); r(7, 16, 2, 2, '#c6303b');
});

const crate = () => sprite(20, 18, (r) => {
  r(0, 0, 20, 18, '#a8683a');
  r(0, 0, 20, 2, '#c98a4f');
  r(2, 2, 16, 14, '#8a5530');
  r(2, 8, 16, 2, '#a8683a');
  r(2, 2, 2, 14, '#a8683a');
  r(16, 2, 2, 14, '#a8683a');
});

/** The big board of openings Jobs stands by on the dock. */
const corkBoard = () => sprite(92, 62, (r) => {
  r(6, 44, 5, 18, '#5a331d'); r(81, 44, 5, 18, '#5a331d');
  r(0, 0, 92, 48, '#6a4023'); r(0, 0, 92, 2, '#94603a');
  r(3, 3, 86, 42, '#c9a064');
  r(3, 3, 86, 7, '#2f3a5f');
  for (let x = 30; x < 62; x += 4) r(x, 5, 2, 3, '#fff4dc');
  [[6, 13, 16, 13, '#fbf1d6'], [26, 12, 14, 15, '#bfe0f0'], [44, 14, 16, 12, '#f6d97a'], [64, 12, 20, 14, '#fbf1d6'],
    [8, 29, 14, 13, '#f4b6c7'], [25, 30, 18, 12, '#fbf1d6'], [47, 29, 14, 13, '#bfe0f0'], [65, 30, 18, 12, '#f6d97a']].forEach(([x, y, w, h, col], i) => {
    r(x, y, w, h, col);
    r(x + 2, y + 3, w - 4, 1, '#8a7a66');
    r(x + 2, y + 6, w - 6, 1, '#8a7a66');
    if (h > 12) r(x + 2, y + 9, w - 8, 1, '#8a7a66');
    r(x + (w >> 1) - 1, y - 1, 2, 2, ['#c6303b', '#2f4db0', '#2f7a3a'][i % 3]);
  });
});

/** A long walnut table with a laptop at one end, a notepad and a glass of water. */
const boardTable = () => sprite(116, 24, (r) => {
  r(0, 0, 116, 12, '#4a2c20');
  r(0, 0, 116, 2, '#6a4030');
  r(0, 12, 116, 4, '#2f1c14');
  r(8, 16, 4, 8, '#2f1c14'); r(104, 16, 4, 8, '#2f1c14');
  r(20, 3, 20, 7, '#c6ccd4'); r(20, 9, 20, 1, '#8a8f99'); // the laptop, closed to a slab from this angle
  r(72, 3, 12, 8, '#fbf1d6'); r(74, 5, 8, 1, '#8a7a66'); r(74, 7, 6, 1, '#8a7a66');
  r(92, 2, 4, 7, '#bfe8f3'); r(92, 2, 4, 1, '#ffffff');
});

const plant = () => sprite(16, 28, (r) => {
  r(4, 19, 8, 9, '#b4551f');
  r(4, 19, 8, 2, '#d0783c');
  disc(r, 8, 9, 7, '#2f7a3a');
  disc(r, 7, 7, 4, '#4f9e45');
  r(5, 4, 3, 1, '#86c752');
});

const wallThing = {
  picture: (seed) => sprite(26, 20, (r) => {
    r(0, 0, 26, 20, '#6a4023');
    r(2, 2, 22, 16, seed % 2 ? '#9fd6ea' : '#f6ecd8');
    disc(r, 18, 7, 3, seed % 2 ? '#ffd76a' : '#e0553f');
    r(2, 13, 22, 5, seed % 2 ? '#5a9a55' : '#2a4a8c');
  }),
  guitar: () => sprite(14, 40, (r) => {
    r(6, 0, 3, 20, '#6a4023');
    r(5, 0, 5, 4, '#3a2e38');
    oval(r, 7, 30, 6, 8, '#d9694a');
    oval(r, 7, 22, 4, 5, '#d9694a');
    oval(r, 7, 27, 2, 2, '#3a2318');
  }),
  poster: () => sprite(20, 28, (r) => {
    r(0, 0, 20, 28, '#301f4d');
    disc(r, 10, 12, 7, '#ffd95a');
    disc(r, 10, 12, 3, '#301f4d');
    r(3, 23, 14, 2, '#e0553f');
  }),
  pegboard: () => sprite(44, 30, (r) => {
    r(0, 0, 44, 30, '#c9a064');
    r(0, 0, 44, 1, '#e0bd86');
    r(6, 5, 3, 18, '#8fa0b0');
    r(4, 5, 7, 4, '#6a7a8a');
    r(16, 5, 2, 16, '#c6303b');
    r(14, 20, 6, 4, '#c6303b');
    r(27, 5, 2, 12, '#8fa0b0');
    disc(r, 28, 21, 4, '#8fa0b0');
    disc(r, 28, 21, 2, '#c9a064');
    r(37, 5, 3, 20, '#f0a12a');
  }),
  chart: () => sprite(34, 26, (r) => {
    r(0, 0, 34, 26, '#fbf1d6');
    r(0, 0, 34, 3, '#2a4a8c');
    [[4, 12], [10, 8], [16, 14], [22, 5], [28, 11]].forEach(([x, top]) => r(x, top + 6, 4, 25 - top - 6, x % 4 ? '#3aa39a' : '#e0ad45'));
  }),
  board: () => sprite(40, 26, (r) => {
    r(0, 0, 40, 26, '#6a4023');
    r(2, 2, 36, 22, '#27594a');
    r(5, 6, 20, 1, '#e8f2e0');
    r(5, 10, 26, 1, '#e8f2e0');
    r(5, 14, 14, 1, '#e8f2e0');
    r(24, 18, 10, 1, '#ffd95a');
  }),
};

const floorThing = {
  speaker: () => sprite(18, 32, (r) => {
    r(0, 0, 18, 32, '#2f2838');
    disc(r, 9, 9, 5, '#6a6578');
    disc(r, 9, 9, 2, '#14121f');
    disc(r, 9, 23, 7, '#6a6578');
    disc(r, 9, 23, 3, '#14121f');
  }),
  toolbox: () => sprite(26, 18, (r) => {
    r(0, 6, 26, 12, '#c6303b');
    r(0, 6, 26, 2, '#e0553f');
    r(9, 1, 8, 2, '#8fa0b0');
    r(9, 1, 2, 6, '#8fa0b0');
    r(15, 1, 2, 6, '#8fa0b0');
    r(11, 10, 4, 3, '#ffd95a');
  }),
  cabinet: () => sprite(20, 40, (r) => {
    r(0, 0, 20, 40, '#8fa0b0');
    r(0, 0, 20, 2, '#b5c3cf');
    [4, 17, 30].forEach((y) => { r(2, y, 16, 10, '#a8b7c4'); r(7, y + 3, 6, 2, '#5a6878'); });
  }),
  floorLamp: () => sprite(14, 44, (r) => {
    r(6, 12, 2, 30, '#3a2e38');
    r(2, 41, 10, 3, '#3a2e38');
    r(1, 0, 12, 13, '#ffd76a');
    r(1, 0, 12, 2, '#fff1b0');
    r(1, 11, 12, 2, '#d9a53a');
  }),
};

// What each kind of room holds, most important first: a narrow room leaves out the last of each list.
// wall hangs right of the window, side stands between the bed and the window, floor follows the desk.
// Each entry is [sprite, the y of its bottom edge]. f is the y where the floor meets the wall.
const KITS = {
  study: (f) => ({ wall: [[wallThing.board(), 34]], side: [[shelf(21), f], [shelf(22), f]], floor: [] }),
  music: (f) => ({ wall: [[wallThing.poster(), 33], [wallThing.poster(), 33]], side: [[floorThing.speaker(), f + 2], [wallThing.guitar(), WALL_H + 2]], floor: [[floorThing.speaker(), f + 6]] }), // the guitar is tall, so it goes by the window, clear of the back button
  bench: (f) => ({ wall: [[wallThing.pegboard(), 33]], side: [[shelf(31), f]], floor: [[floorThing.toolbox(), f + 10]] }),
  office: (f) => ({ wall: [[wallThing.chart(), 33], [wallThing.picture(1), 30]], side: [[floorThing.cabinet(), f + 2], [floorThing.cabinet(), f + 2]], floor: [] }),
  home: (f) => ({ wall: [[wallThing.picture(2), 30]], side: [[shelf(41), f], [floorThing.floorLamp(), f + 2]], floor: [] }),
};
const ROOM_HALF_MAX = 178; // past this a wide room just shows more bare floor at its edges
const WINDOW_HALF = 41; // from the middle of the window to just past its curtain rod
const DESK_TUCK = 20; // only the low end of the desk may sit under the sill, the monitor stays clear of it

const themeOf = (name) => {
  if (/god/i.test(name)) return 'sky';
  if (/music|song|audio/i.test(name)) return 'music';
  if (/study|tutor|school/i.test(name)) return 'study';
  if (/engin|code|dev/i.test(name)) return 'bench';
  if (/mayor|manag|boss|money|bank|^jobs$|office/i.test(name)) return 'office';
  return 'home';
};

/** Evening and night darken a scene, and its lamp warms the middle. */
function dusk(g, LW, LH, cx, phase) {
  if (!TINT[phase]) return;
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = phase === 'night' ? '#a58fb4' : '#ffe0c6';
  g.fillRect(0, 0, LW, LH);
  g.globalCompositeOperation = 'lighter';
  [112, 84, 56].forEach((rad) => glow(g, cx, WALL_H + 24, rad, 'rgba(255,190,110,.04)'));
  g.globalCompositeOperation = 'source-over';
}

/** The size and centre every scene shares: centred in what the chat doesn't cover, lower in a tall window. */
function stage(view) {
  const c = make(view.LW, view.LH);
  const g = c.getContext('2d');
  const left = view.left ?? 0; // what the buttons down the left side cover
  const cx = (left + (view.focus ?? view.LW)) >> 1;
  return { c, g, cx, half: Math.min(cx - left, ROOM_HALF_MAX), lower: Math.max(0, Math.min(24, (view.LH - 140) >> 1)), R: (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); } };
}

/** Jobs works out on the dock: sea behind, planks underfoot, the board of openings and its boat. */
function buildDock(view, phase) {
  const { LW, LH } = view;
  const { c, g, cx, half, lower, R } = stage(view);
  const night = phase === 'night';
  const deck = WALL_H + 6;
  R(0, 0, LW, deck - 18, SKY[phase]);
  const rand = seeded(31);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rand() * LW), y = 4 + Math.floor(rand() * 22);
    if (night) R(x, y, 1, 1, '#ffffff');
    else { R(x, y, 18, 3, '#ffffff'); R(x + 4, y - 2, 9, 2, '#ffffff'); }
  }
  R(0, deck - 18, LW, 18, night ? '#1c2f5a' : '#3a92c8');
  R(0, deck - 18, LW, 1, night ? '#2a4070' : '#8fd0ea');
  for (let y = deck - 15; y < deck; y += 4) for (let x = (y * 7) % 23; x < LW; x += 23) R(x, y, 6, 1, night ? '#2a4070' : '#6fbce0');
  g.drawImage(boat('#4a66c4'), cx - half + 4, deck - 26);
  for (let y = deck, row = 0; y < LH; y += 8, row++) {
    R(0, y, LW, 8, ['#b07a45', '#a8703f', '#bb8550'][row % 3]);
    R(0, y + 7, LW, 1, '#7a4a28');
    for (let x = (row * 29) % 60; x < LW; x += 60) R(x, y, 1, 7, '#8a5a30');
  }
  R(0, deck, LW, 3, '#5a331d');
  for (let x = 10; x < LW; x += 48) { R(x, deck - 6, 6, 9, '#5a331d'); R(x, deck - 6, 6, 2, '#7a4a28'); }

  const board = corkBoard();
  g.drawImage(board, cx - (board.width >> 1), deck + 18 - board.height);
  const deskSprite = desk();
  const deskLeft = cx + 52, deskY = deck + 24;
  g.drawImage(deskSprite, deskLeft, deskY - deskSprite.height);
  g.drawImage(crate(), cx - 108, deck + 4);
  g.drawImage(crate(), cx - 96, deck + 20);
  g.drawImage(newsBundle(), cx - 74, deck + 26);
  g.drawImage(lamp(), cx - 66, deck - 16);
  g.drawImage(barrel(), cx + half - 22, deck + 2);
  g.drawImage(barrel(), cx + half - 36, deck + 8);
  g.drawImage(ropeCoil(), cx - 44, deck + 44);
  g.drawImage(ropeCoil(), cx + 70, deck + 30);
  for (const [gx, gy] of [[cx - 40, 14], [cx + 20, 8], [cx + 60, 20]]) { R(gx, gy, 2, 1, '#3a3f4a'); R(gx + 2, gy + 1, 1, 1, '#3a3f4a'); R(gx + 3, gy, 2, 1, '#3a3f4a'); } // gulls
  dusk(g, LW, LH, cx, phase);
  const deskX = deskLeft + (deskSprite.width >> 1);
  return { c, cx, bed: null, stand: { x: cx, y: deck + 30 + lower }, desk: { x: deskX, y: deskY + 12, screenX: deskX - 7, screenY: deskY - 39 } };
}

const HEAVEN_SKY = { dawn: ['#ffd1c2', '#ffe8d6'], day: ['#8fd3f0', '#d8f2fb'], dusk: ['#f5b38f', '#ffe0c6'], night: ['#2a2f6a', '#4a4f8f'] };

/** God's room is the sky itself: clouds to the horizon, and a computer on a cloud. */
function buildHeaven(view, phase) {
  const { LW, LH } = view;
  const { c, g, cx, lower, R } = stage(view);
  const [top, low] = HEAVEN_SKY[phase];
  const bands = 8;
  for (let i = 0; i < bands; i++) R(0, Math.floor((i * LH) / bands), LW, Math.ceil(LH / bands) + 1, mix(top, low, i / (bands - 1)));
  const rand = seeded(7);
  if (phase === 'night') for (let i = 0; i < 40; i++) R(Math.floor(rand() * LW), Math.floor(rand() * WALL_H * 1.5), 1, 1, '#ffffff');
  for (let x = cx - 150; x < cx + 150; x += 50) for (let i = 0; i < 40; i++) R(x + i, i * 3, 3, 3, 'rgba(255,248,214,.18)'); // light from above
  const puff = (x, y, w, col) => {
    oval(R, x, y, w, Math.max(3, w >> 2), col);
    disc(R, x - (w >> 2), y - (w >> 3), Math.max(3, w >> 3), col);
    disc(R, x + (w >> 3), y - (w >> 2), Math.max(3, w >> 2), col);
  };
  for (let i = 0; i < 9; i++) puff(Math.floor(rand() * LW), 8 + Math.floor(rand() * 36), 14 + Math.floor(rand() * 18), 'rgba(255,255,255,.75)');
  // A sea of cloud from the horizon down.
  const horizon = WALL_H + 4;
  R(0, horizon, LW, LH - horizon, '#f4fbff');
  for (let x = -10; x < LW + 20; x += 22) disc(R, x, horizon + (x % 3), 13, '#f4fbff');
  for (let y = horizon + 18; y < LH; y += 16) for (let x = (y % 32) - 16; x < LW + 20; x += 32) disc(R, x, y, 9, '#e6f2fa');

  const base = WALL_H + 40 + lower; // the cloud everyone stands on
  oval(R, cx + 8, base + 3, 96, 12, '#c9dcec');
  oval(R, cx + 8, base, 94, 11, '#ffffff');
  [-60, -20, 30, 70].forEach((dx, i) => disc(R, cx + dx, base - 6, 12 + (i % 2) * 4, '#ffffff'));
  g.drawImage(harp(), cx - 78, base - 26);
  for (let i = 0; i < 14; i++) { // a little sparkle in the air
    const x = Math.floor(rand() * LW), y = 6 + Math.floor(rand() * (base - 10));
    R(x, y - 1, 1, 3, '#fff1b0'); R(x - 1, y, 3, 1, '#fff1b0');
  }
  const deskSprite = desk();
  const deskLeft = cx + 6, deskY = base + 2;
  g.drawImage(deskSprite, deskLeft, deskY - deskSprite.height);
  const deskX = deskLeft + (deskSprite.width >> 1);
  return { c, cx, bed: null, stand: { x: cx - 34, y: base + 4 }, desk: { x: deskX, y: deskY + 12, screenX: deskX - 7, screenY: deskY - 39 } };
}

const CITY_SKY = { dawn: '#f5c4b0', day: '#bfe3f5', dusk: '#f0a585', night: '#1a2150' };

/** The interview room: a high-rise meeting room, all glass, with the city behind it. The table sits in front of Jobs. */
function buildBoardroom(view, phase) {
  const { LW, LH } = view;
  const { c, g, cx, half, lower, R } = stage(view);
  const front = make(LW, LH);
  const f = front.getContext('2d');
  const night = phase === 'night';
  const ceiling = 8, glass = WALL_H + 6;
  R(0, 0, LW, glass, CITY_SKY[phase]);
  const rand = seeded(212);
  [[30, '#a9b8ca', '#bccad9'], [48, '#6b7b90', '#56657a']].forEach(([tallest, face, side]) => {
    for (let x = -4; x < LW;) {
      const w = 10 + Math.floor(rand() * 18);
      const h = Math.floor(tallest * (0.35 + rand() * 0.65));
      const top = glass - h;
      R(x, top, w, h, face);
      R(x, top, 2, h, side);
      if (rand() < 0.2) R(x + (w >> 1) - 1, top - 8, 2, 8, face);
      for (let y = top + 3; y < glass - 2; y += 4) for (let wx = x + 3; wx < x + w - 2; wx += 4) if (rand() < (night ? 0.4 : 0.12)) R(wx, y, 1, 2, night ? '#ffe39a' : '#dcecf5');
      x += w + 1;
    }
  });
  if (!night) for (let x = 6; x < LW; x += 80) for (let i = 0; i < 10; i++) R(x + i, ceiling + 4 + i * 3, 2, 2, 'rgba(255,255,255,.35)');
  for (let x = (cx % 40) - 40; x < LW; x += 40) R(x, ceiling, 3, glass - ceiling, '#2b2f38');
  R(0, 0, LW, ceiling, '#e4e0d8');
  R(0, ceiling - 2, LW, 2, '#b9b4aa');
  for (let x = (cx % 40) - 22; x < LW; x += 40) R(x, ceiling - 3, 6, 1, '#fff6d0');
  R(0, glass - 3, LW, 5, '#2b2f38');
  R(0, glass + 2, LW, 2, '#4a505c');
  R(0, glass + 4, LW, LH - glass - 4, '#4f5562');
  for (let y = glass + 8; y < LH; y += 6) for (let x = (y % 12) / 2; x < LW; x += 6) R(x, y, 1, 1, '#5a6170');

  [-40, 40].forEach((dx) => { // pendant lamps, hung from the ceiling
    R(cx + dx, ceiling, 1, 8, '#2b2f38');
    R(cx + dx - 6, ceiling + 8, 13, 4, '#e8e2d0');
    R(cx + dx - 4, ceiling + 12, 9, 1, '#fff1b0');
  });

  const table = boardTable();
  const standY = WALL_H + 40 + lower;
  const tableLeft = cx - (table.width >> 1), tableBottom = standY + 26; // low enough that only Jobs' legs are behind it
  const rugTop = tableBottom - 34;
  R(cx - 90, rugTop, 180, 46, '#8a7a5a');
  R(cx - 88, rugTop + 2, 176, 42, '#2f2a3a');
  for (let x = cx - 80; x < cx + 80; x += 10) R(x, rugTop + 6, 4, 1, '#4a4058');

  g.drawImage(credenza(), cx - half + 34, glass + 18 - 20);
  g.drawImage(easel(), cx - half + 6, glass + 46 - 40);
  g.drawImage(plant(), cx + half - 22, glass + 24 - 30);
  g.drawImage(floorThing.floorLamp(), cx + half - 44, glass + 36 - 46);
  g.drawImage(waterCooler(), cx + half - 66, glass + 22 - 32);
  g.drawImage(plant(), cx - half + 8, glass + 70 - 30);

  f.drawImage(chair(), tableLeft - 22, tableBottom - 28);
  f.drawImage(chair(), tableLeft + table.width + 3, tableBottom - 28);
  f.drawImage(table, tableLeft, tableBottom - table.height);
  dusk(g, LW, LH, cx, phase);
  const shape = make(LW, LH); // the tint fills the whole canvas, so cut it back to the table and chairs
  shape.getContext('2d').drawImage(front, 0, 0);
  dusk(f, LW, LH, cx, phase);
  f.globalCompositeOperation = 'destination-in';
  f.drawImage(shape, 0, 0);
  f.globalCompositeOperation = 'source-over';
  // Behind the table, so the table hides Jobs' legs. At work it types on the laptop, still facing you.
  const laptopX = tableLeft + 31;
  return { c, front, cx, bed: null, stand: { x: cx, y: standY }, desk: { x: laptopX, y: standY, dir: 'down' } };
}

/** A home seen from the same three-quarter angle as the island. Fills the window, centred on the resident. */
export function buildRoom(view, look, phase, room) {
  if (room === 'entrevistas') return buildBoardroom(view, phase);
  if (room === 'puerto') return buildDock(view, phase);
  if (themeOf(look.id) === 'sky') return buildHeaven(view, phase);
  const { LW, LH } = view;
  const c = make(LW, LH);
  const g = c.getContext('2d');
  const free = view.focus ?? LW; // how much of the room isn't behind the chat
  const left = view.left ?? 0; // or behind the buttons down the left
  const cx = (left + free) >> 1;
  const lower = Math.max(0, Math.min(24, (LH - 140) >> 1)); // a taller window brings the rug and resident down
  const theme = themeOf(look.id);
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  /** Lays items along a strip starting at x, and returns where each kept item's left edge ended up. */
  const lay = (items, x, room) => packLane(items.map(([s]) => s.width), room).map((left, i) => {
    g.drawImage(items[i][0], x + left, items[i][1] - items[i][0].height);
    return x + left;
  });

  const TRIM = WALL_H - 18;
  const wall = mix(look.wall, '#f6ecd8', 0.34);
  R(0, 0, LW, WALL_H, wall);
  {
    if (look.pattern === 0) for (let x = 0; x < LW; x += 12) R(x, 0, 5, TRIM, lit(wall, 0.16));
    else if (look.pattern === 1) for (let y = 4; y < TRIM - 2; y += 11) for (let x = (y % 2) * 6; x < LW; x += 12) { R(x + 2, y, 3, 3, lit(wall, 0.3)); R(x + 3, y + 1, 1, 1, dim(wall, 0.2)); }
    else for (let y = 0; y < TRIM; y += 8) { R(0, y, LW, 1, dim(wall, 0.16)); for (let x = (y / 8) % 2 ? 0 : 8; x < LW; x += 16) R(x, y, 1, 8, dim(wall, 0.16)); }
    R(0, 0, LW, 4, dim(wall, 0.34));
    R(0, TRIM, LW, 2, '#fbecc8');
    R(0, TRIM + 2, LW, 13, '#9b6638');
    for (let x = 4; x < LW; x += 14) R(x, TRIM + 2, 1, 13, '#7a4a28');
    R(0, TRIM + 2, LW, 1, '#c08a50');
    R(0, TRIM + 15, LW, 3, '#5a331d');
  }

  const planks = [['#b47b47', '#a66e3e', '#c08a50'], ['#a0663c', '#935a34', '#ae7346'], ['#c48f58', '#b6814c', '#d09c66']][look.pattern];
  const seam = dim(planks[0], 0.26);
  for (let y = WALL_H, row = 0; y < LH; y += 9, row++) {
    for (let x = -((row * 37) % 104); x < LW; x += 104) {
      R(x, y, 104, 9, planks[Math.floor(grain(x, row) * 3)]);
      R(x, y, 1, 9, seam);
      R(x + 18 + Math.floor(grain(row, x) * 50), y + 3 + (row % 3), 16, 1, dim(planks[0], 0.1));
    }
    R(0, y + 8, LW, 1, seam);
  }
  R(0, WALL_H, LW, 5, 'rgba(40,16,40,.3)');

  {
    const rugW = Math.min(148, free - left - 16), rugY = WALL_H + 14 + lower, rugH = 40, rug = dim(look.wall, 0.12);
    R(cx - rugW / 2, rugY, rugW, rugH, OUT);
    R(cx - rugW / 2 + 1, rugY + 1, rugW - 2, rugH - 2, '#f6ecd8');
    R(cx - rugW / 2 + 4, rugY + 4, rugW - 8, rugH - 8, rug);
    for (let x = cx - rugW / 2 + 10; x < cx + rugW / 2 - 8; x += 12) for (let y = rugY + 9; y < rugY + rugH - 6; y += 10) R(x, y, 3, 3, lit(rug, 0.4));
  }

  const winX = cx - 30, winY = 6;
  R(winX - 3, winY - 3, 66, 34, '#f3e3bd');
  R(winX, winY, 60, 28, SKY[phase]);
  R(winX, winY + 20, 60, 8, phase === 'night' ? '#1c2158' : '#5a9a55');
  if (phase === 'night') { R(winX + 44, winY + 6, 7, 7, '#e8ecff'); R(winX + 10, winY + 8, 1, 1, '#fff'); R(winX + 24, winY + 14, 1, 1, '#fff'); }
  else { R(winX + 42, winY + 6, 9, 9, '#ffd76a'); R(winX + 8, winY + 12, 18, 4, '#fff'); R(winX + 12, winY + 9, 10, 3, '#fff'); }
  R(winX + 29, winY, 2, 28, '#f3e3bd');
  R(winX, winY + 13, 60, 2, '#f3e3bd');
  {
    [winX - 7, winX + 57].forEach((x) => {
      R(x, 2, 10, 32, '#fff4dc');
      for (let i = 2; i < 10; i += 3) R(x + i, 2, 1, 32, '#e0cda6');
    });
    R(winX - 10, 1, 80, 2, '#6a4023');
  }
  R(winX - 6, winY + 30, 72, 3, '#8a5530');

  const floorY = WALL_H + 8;
  const deskY = WALL_H + 22;
  const half = Math.min(cx - left, ROOM_HALF_MAX);
  const kit = KITS[theme](floorY);
  const bedSprite = bed(look);
  const bedLeft = cx - half;
  g.drawImage(bedSprite, bedLeft, floorY + 22 - bedSprite.height);
  lay(kit.side, bedLeft + bedSprite.width, half - bedSprite.width - WINDOW_HALF);
  lay(kit.wall, cx + WINDOW_HALF, half - WINDOW_HALF);
  const deskSprite = desk();
  const onFloor = [[deskSprite, deskY], [plant(), floorY + 16], ...kit.floor];
  // The resident works here, so the desk stays even when nothing else fits.
  const [deskLeft] = lay(onFloor, cx + DESK_TUCK, Math.max(half - DESK_TUCK, deskSprite.width));
  const deskX = deskLeft + (deskSprite.width >> 1);

  dusk(g, LW, LH, cx, phase);

  return { c, cx, bed: { x: bedLeft + (bedSprite.width >> 1), y: floorY - 16 }, stand: { x: cx, y: WALL_H + 36 + lower }, desk: { x: deskX, y: deskY + 12, screenX: deskX - 7, screenY: deskY - 39 } };
}

const TUCKED_MS = 650;
const RUN_IN_MS = 900;

/** In bed if the room has one, otherwise dozing on their feet. */
function drawSleeper(g, room, look, ms) {
  const s = personSprite(look, 'down', 0);
  const { bed, stand } = room;
  if (bed) g.drawImage(s, 0, 0, s.width, 13, bed.x - (s.width >> 1), bed.y, s.width, 13);
  else drawAt(g, s, stand.x, stand.y);
  const at = bed ?? { x: stand.x, y: stand.y - s.height - 4 };
  g.fillStyle = '#ffffff';
  const rise = Math.floor(ms / 200) % 4;
  ZED.forEach(([x, y, w, h]) => g.fillRect(at.x + 12 + x, at.y - 6 - rise + y, w, h));
}

/** Whatever they were doing, they drop it and come to you. Returns false once they've arrived. */
function drawEntrance(g, room, look, ms, { asleep, start }) {
  const t = ms - start;
  const { stand, bed } = room;
  const tucked = asleep && bed;
  if (tucked && t < TUCKED_MS) {
    drawSleeper(g, room, look, ms);
    return true;
  }
  const from = tucked ? { x: bed.x + 28, y: bed.y + 34 } : { x: stand.x + 70, y: stand.y + 8 };
  const p = Math.max(0, (t - (tucked ? TUCKED_MS : 0)) / RUN_IN_MS);
  if (p >= 1) return false;
  drawAt(g, personSprite(look, 'side', [0, 1, 0, 2][Math.floor(ms / 90) % 4]), from.x + (stand.x - from.x) * p, from.y + (stand.y - from.y) * p, stand.x < from.x);
  return true;
}

export function drawRoom(g, room, look, working, ms, entrance, sleeping = false) {
  g.imageSmoothingEnabled = false;
  g.drawImage(room.c, 0, 0);
  const beat = Math.floor(ms / 240);
  const inFront = () => { if (room.front) g.drawImage(room.front, 0, 0); }; // whatever stands between you and the resident
  if (working) {
    if (room.desk.screenX !== undefined) {
      g.fillStyle = beat % 2 ? '#7df0c8' : '#5fd8b0';
      g.fillRect(room.desk.screenX, room.desk.screenY, 20, 14);
      g.fillStyle = '#1f7a68';
      for (let i = 0; i < 4; i++) g.fillRect(room.desk.screenX + 2, room.desk.screenY + 2 + i * 3, 6 + ((beat + i * 3) % 12), 1);
    }
    drawAt(g, personSprite(look, room.desk.dir ?? 'up', beat % 2 ? 1 : 2), room.desk.x, room.desk.y);
    return inFront();
  }
  if (sleeping) {
    drawSleeper(g, room, look, ms);
    return inFront();
  }
  if (entrance && drawEntrance(g, room, look, ms, entrance)) return inFront();
  const idle = Math.floor(ms / 1200) % 4;
  drawAt(g, personSprite(look, 'down', 0), room.stand.x, room.stand.y + (idle === 3 ? -1 : 0));
  inFront();
}

