import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TABLES, buildIsland, dockOf, drawGod, drawIsland, houseSprite, lookOf, personSprite, plotOf, portraitUrl, seasonOf, spokeEnd, stationOf } from './art.js';
import { islandView, shown } from './layout.js';
import { COMMON, NEWS, REPORTER, bubbleOf, isGod, isJobs, isMayor, jobOf, moodOf, newsOf, pairUp, partyJob, reporterBubble, stateOf, wordsFor } from './news.js';

const MIN_RX = 322;
const MANOR = { x: 0, y: -66, big: true };
const WALK_SPEED = 20; // logical pixels a second
const FRAME_MS = 30; // drawn in step with the display, about 30 times a second
const SEAT_RX = 46;
const SEAT_RY = 24;
const SAIL_RATE = 0.12; // share of the trip covered each second
const TICKER_MS = 6000;
const PAPER_KEY = 'agent-house-paper';
const SEEN_KEY = 'agent-house-seen-visits';
const VISIT_WINDOW_MS = 6 * 36e5; // a note or a talk is only worth a walk if it is this fresh
const VISIT_STAY_MS = 20_000;
const FREE_FOR_VISIT = new Set(['stroll', 'social', 'eat', 'work', 'play', 'jog']); // not working, asleep, napping or in a meeting
const AT_HOME = new Set(['working', 'asleep', 'nap']);
const JOG_PACE = 2; // runners go this many times walking speed
const loadSeen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); }
};
const saveSeen = (seen) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-100))); } catch { /* it may play again */ }
};

// Homes stay put when someone new moves in. Anyone not listed takes the next plot, by name.
const SETTLED = ['Engineer', 'Music', 'Tutoring', 'Jobs', 'Money'];
const settled = (name) => (SETTLED.includes(name) ? SETTLED.indexOf(name) : SETTLED.length);

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointInPlaza = () => {
  const angle = Math.random() * Math.PI * 2;
  const reach = 0.6 + Math.random() * 0.28;
  return { x: Math.cos(angle) * 74 * reach, y: Math.sin(angle) * 40 * reach };
};

const ICONS = {
  letter: ['XXXXXXXXX', 'XWWWWWWWX', 'XXWWWWWXX', 'XWXWWWXWX', 'XWWXXXWWX', 'XWWWWWWWX', 'XXXXXXXXX'],
  dots: ['.........', '.........', '.XX.XX.XX', '.XX.XX.XX', '.........'],
  alert: ['...RRR...', '...RRR...', '...RRR...', '...RRR...', '.........', '...RRR...', '...RRR...'],
  list: ['XXXXXXXXX', 'XWWWWWWWX', 'XRWXXXXWX', 'XWWWWWWWX', 'XRWXXXXWX', 'XWWWWWWWX', 'XRWXXWWWX', 'XXXXXXXXX'],
  cloud: ['..GGG....', '.GGGGGGG.', 'GGGGGGGGG', 'GGGGGGGGG', '.BW.BW.B.', '..W..W...'],
  star: ['....Y....', '...YYY...', 'YYYYYYYYY', '.YYYYYYY.', '..YYYYY..', '.YY...YY.'],
  hi: ['..XXXXX..', '.XWWWWWX.', 'XWWXWXWWX', 'XWWWWWWWX', 'XWXWWWXWX', '.XWXXXWX.', '..XXXXX..'],
  calendar: ['RRRRRRRRR', 'RRRRRRRRR', 'XWWWWWWWX', 'XWXWXWXWX', 'XWWWWWWWX', 'XWXWXWXWX', 'XXXXXXXXX'],
  phone: ['XXX...XXX', 'XNX...XNX', 'XNNXXXNNX', 'XNNNNNNNX', '.XXXXXXX.'],
  moon: ['..XXXX...', '.XYYYYX..', 'XYYYX....', 'XYYX.....', 'XYYYX....', '.XYYYYX..', '..XXXX...'],
  zzz: ['.XXXXX...', '....X....', '...X.XXX.', '..X....X.', '.XXXXX.X.', '......XXX'],
};
const ICON_COLORS = { X: '#3b2318', W: '#fff8e7', R: '#d9313f', Y: '#f0b429', G: '#8fa0b0', B: '#4a9ccc', N: '#3fae5a' };

export function Icon({ name, scale = 2 }) {
  const rows = ICONS[name];
  return (
    <svg className="icon" width={9 * scale} height={rows.length * scale} viewBox={`0 0 9 ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((k, x) => (ICON_COLORS[k] ? <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill={ICON_COLORS[k]} /> : null)))}
    </svg>
  );
}

function Think({ bubble }) {
  return (
    <span className="think" data-ring={bubble.ring || undefined}>
      <Icon name={bubble.icon} />
      <span className="think-text">{bubble.text}</span>
    </span>
  );
}

// Far side of both tables first, so faces show and nobody piles onto one table.
const EAT_SEATS = [
  ...[-8, 8].flatMap((dx) => TABLES.map(([x, y]) => ({ x: x + dx, y: y - 3, dir: 'down' }))),
  ...[-8, 8].flatMap((dx) => TABLES.map(([x, y]) => ({ x: x + dx, y: y + 11, dir: 'up' }))),
];
// In pairs, turned towards each other.
const SOCIAL_SPOTS = [
  { x: -26, y: -28, dir: 'side' }, { x: -12, y: -28, dir: 'side', flip: true },
  { x: 20, y: -28, dir: 'side' }, { x: 34, y: -28, dir: 'side', flip: true },
  { x: -58, y: 6, dir: 'side' }, { x: -44, y: 6, dir: 'side', flip: true },
  { x: 44, y: 6, dir: 'side' }, { x: 58, y: 6, dir: 'side', flip: true },
];
// In front of the fountain and either side of it, facing each other, clear of the tables and the chatters.
const PLAY_SPOTS = [
  { x: -16, y: 32, dir: 'side' }, { x: 16, y: 32, dir: 'side', flip: true },
  { x: -30, y: -12, dir: 'side' }, { x: 30, y: -12, dir: 'side', flip: true },
];
// A lap around the square, run point to point.
const lapPoint = (npc) => {
  npc.lap = (npc.lap ?? Math.floor(Math.random() * 8)) + 1;
  const angle = (npc.lap * Math.PI) / 4;
  return { x: Math.cos(angle) * 66, y: Math.sin(angle) * 36 };
};
const BOBBING = new Set(['bench', 'eat', 'teach', 'garden', 'ledger', 'ball']);

/** Where each chatting resident stands: pairs with a real tie share a pair of facing spots, the rest take what is left. */
function socialSeating(names, exchanges) {
  const spot = {};
  const partner = {};
  pairUp(names, exchanges).forEach(([a, b], k) => {
    [spot[a], spot[b]] = [(2 * k) % SOCIAL_SPOTS.length, (2 * k + 1) % SOCIAL_SPOTS.length];
    [partner[a], partner[b]] = [b, a];
  });
  const open = SOCIAL_SPOTS.map((_, i) => i).filter((i) => !Object.values(spot).includes(i));
  names.filter((n) => !(n in spot)).forEach((n, i) => { spot[n] = open.length ? open[i % open.length] : i % SOCIAL_SPOTS.length; });
  return { spot, partner };
}

function jobSpot(job, plot, rx) {
  if (job === 'board') return { at: 'plaza', x: -52, y: -8, dir: 'up', fx: 'board' };
  if (job === 'dock') return { at: 'station', ...dockOf(rx).desk, dir: 'side', flip: true };
  const st = stationOf(plot);
  if (job === 'books') return { at: 'station', x: st.x - 5, y: st.y + 1, dir: 'down', fx: 'books', st };
  // In front of the station, facing it, so nobody stands in the corner of their own house.
  return { at: 'station', x: st.x, y: st.y + 5, dir: 'up', fx: job, st };
}

function newNpc(plot) {
  return { x: plot.x, y: plot.y + 9, inside: false, loc: 'door', path: [], arrive: null, key: null, until: 0, dir: 'down', flip: false, walking: false };
}

/** Everyone keeps to the spokes: station to door, door to the square. */
function routeTo(npc, goal, door, edge) {
  const path = [];
  let at = npc.loc;
  if (at === 'visit') { // leaving someone's door: back along their path first
    path.push(npc.via);
    at = 'plaza';
  }
  if (goal.at === 'visit') { // to someone else's door: out of one's own, then along theirs
    if (at === 'station') path.push(door);
    if (at !== 'plaza') path.push(edge);
    path.push(goal.via, { x: goal.x, y: goal.y });
    return path;
  }
  if (at === 'station' && goal.at !== 'station') path.push(door);
  if ((at === 'plaza') !== (goal.at === 'plaza')) path.push(edge);
  if (at === 'plaza' && goal.at === 'station') path.push(door);
  path.push({ x: goal.x, y: goal.y });
  return path;
}

function stepNpc(npc, { plot, goal, state }, dt, ms, still) {
  const pace = !goal && state === 'jog' ? JOG_PACE : 1;
  const door = { x: plot.x, y: plot.y + 9 };
  const edge = spokeEnd(door);
  const key = goal ? [goal.at, goal.x, goal.y, Boolean(goal.inside)].join('|') : 'stroll';

  // A walk in progress finishes first, so nobody cuts through a house to change plans. Work can't wait: it's already home.
  if (npc.key !== key && (!npc.path.length || goal?.now)) {
    const opening = npc.key === null;
    npc.key = key;
    npc.arrive = goal;
    if ((opening || goal?.now) && goal && goal.at !== 'visit') {
      // Opening the app finds everyone already at it, and a task finds its resident already inside.
      Object.assign(npc, { x: goal.x, y: goal.y, loc: goal.at, inside: Boolean(goal.inside), dir: goal.dir ?? 'down', flip: Boolean(goal.flip), path: [], walking: false, via: goal.via ?? npc.via });
    } else {
      if (npc.inside && !goal?.inside) Object.assign(npc, { inside: false, x: door.x, y: door.y, loc: 'door' });
      if (goal && !npc.inside) {
        npc.path = routeTo(npc, goal, door, edge);
        npc.loc = goal.at;
        npc.via = goal.via ?? npc.via;
      }
      npc.until = ms + Math.random() * 3000;
    }
  }

  if (npc.path.length) {
    const target = npc.path[0];
    const dx = target.x - npc.x, dy = target.y - npc.y;
    const dist = Math.hypot(dx, dy);
    const stride = still ? Infinity : WALK_SPEED * pace * dt;
    npc.walking = true;
    npc.dir = Math.abs(dx) > Math.abs(dy) ? 'side' : dy > 0 ? 'down' : 'up';
    npc.flip = dx < 0;
    if (dist <= stride) {
      npc.x = target.x;
      npc.y = target.y;
      npc.path.shift();
    } else {
      npc.x += (dx / dist) * stride;
      npc.y += (dy / dist) * stride;
    }
    if (!npc.path.length) {
      npc.walking = false;
      npc.dir = npc.arrive?.dir ?? 'down';
      npc.flip = Boolean(npc.arrive?.flip);
      npc.until = pace > 1 ? 0 : ms + 2000 + Math.random() * 7000; // a runner doesn't stop between points
      if (npc.arrive?.inside) npc.inside = true;
    }
  } else if (!goal && !still && ms > npc.until) {
    const home = pace === 1 && npc.loc === 'plaza' && Math.random() >= 0.68;
    npc.path = routeTo(npc, home ? { at: 'door', ...door } : { at: 'plaza', ...(pace > 1 ? lapPoint(npc) : pointInPlaza()) }, door, edge);
    npc.loc = home ? 'door' : 'plaza';
  }
  return npc.walking ? [0, 1, 0, 2][Math.floor((ms * pace) / 130) % 4] : 0;
}

/** A dialog that closes like its own back button when you click outside it. Returns its ref and the props that do that. */
function useModal(open, onClose) {
  const ref = useRef(null);
  const pressedOutside = useRef(false); // a drag that only ends out there doesn't count
  useEffect(() => {
    if (open && !ref.current.open) ref.current.showModal();
    if (!open && ref.current.open) ref.current.close();
  }, [open]);
  const outside = (e) => {
    const box = ref.current.getBoundingClientRect();
    return e.target === ref.current && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
  };
  return [ref, {
    onPointerDown: (e) => { pressedOutside.current = outside(e); },
    onClick: (e) => { if (pressedOutside.current && outside(e)) onClose(); },
  }];
}

/** The reporter's paper. He can't be talked to, only sent out for more. */
function Dispatch({ open, news, onMore, onClose }) {
  const [ref, backdrop] = useModal(open, onClose);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState(null);
  const sections = Object.entries(Object.groupBy(news?.items ?? [], (n) => n.topic));
  const [shown, stories] = sections.find(([t]) => t === topic) ?? sections[0] ?? [];
  const date = news?.day ? new Date(`${news.day}T12:00:00`).toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const problem = error || news?.error;
  return (
    <dialog className="paper dispatch" ref={ref} onClose={onClose} aria-label="News from the dock" {...backdrop}>
      <header>
        <div>
          <h2>News from the dock</h2>
          <p>{date}</p>
        </div>
        <div className="dispatch-actions">
          <button type="button" className="action" disabled={news?.busy} onClick={async () => setError((await onMore()) ?? '')}>
            {news?.busy ? 'At sea…' : 'Find more news'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Back to the island</button>
        </div>
      </header>
      {problem && !news?.busy && <p className="refused" role="alert">{problem}</p>}
      <div className="dispatch-main">
      {sections.length > 0 && (
        <nav className="topics" aria-label="Sections">
          {sections.map(([t, list]) => (
            <button type="button" key={t} className="plain" aria-pressed={t === shown} onClick={() => setTopic(t)}>
              <span>{t}</span> <small>{list.length}</small>
            </button>
          ))}
        </nav>
      )}
      <div className="dispatch-body">
        {!sections.length && <p className="quiet">{news?.busy ? `The ${REPORTER.toLowerCase()} is out on the boat finding today's news.` : 'No news yet.'}</p>}
        {stories && (
          <ul aria-label={shown}>
            {stories.map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                {n.summary && <p>{n.summary}</p>}
                <small>{n.source}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </dialog>
  );
}

/** The front page: only true things, each one a door to whoever it's about. */
function Paper({ open, news, today, onClose, onGo }) {
  const [ref, backdrop] = useModal(open, onClose);
  const [lead, ...rest] = news;
  const date = today ? new Date(`${today}T12:00:00`).toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  return (
    <dialog className="paper" ref={ref} onClose={onClose} aria-label="Today's news" {...backdrop}>
      <header>
        <h2>Island news</h2>
        <p>{date}</p>
      </header>
      {lead && (
        <button type="button" className="paper-lead" onClick={(e) => onGo(lead.who, e)}>
          <b>{lead.text}</b>
          <span>Go now</span>
        </button>
      )}
      <ul>
        {rest.map((line) => (
          <li key={line.text}><button type="button" onClick={(e) => onGo(line.who, e)}>{line.text}</button></li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={onClose}>To the island</button>
    </dialog>
  );
}

export default function Island({ agents, live, house, active, now, phase, onGo, onMoreNews }) {
  const hostRef = useRef(null);
  const scrollRef = useRef(null);
  const worldRef = useRef(null);
  const canvasRef = useRef(null);
  const npcEls = useRef({});
  const npcs = useRef({});
  const [size, setSize] = useState(null);
  const [paper, setPaper] = useState(false);
  const [dispatch, setDispatch] = useState(false);
  const voyages = useRef([{ t: 0, flip: false }, { t: 0, flip: false }]); // the reporter's boat, then Jobs'
  const [tick, setTick] = useState(0);
  const [visit, setVisit] = useState(null); // a note or a talk being taken to someone's door, one at a time
  const visitRef = useRef(null);
  const arrivedRef = useRef(0);
  const seenRef = useRef(null);
  visitRef.current = visit;

  const god = agents?.find((a) => isGod(a.name));
  const residents = useMemo(() => {
    const list = agents?.filter((a) => !isGod(a.name)).sort((a, b) => isMayor(b.name) - isMayor(a.name) || settled(a.name) - settled(b.name)) ?? [];
    let next = 0;
    // ponytail: unlisted folders follow name order, so a new one can swap their plots. Persist plots if that ever matters.
    return list.map((agent) => ({ agent, plot: isMayor(agent.name) ? MANOR : plotOf(next++) }));
  }, [agents]);
  const names = residents.map((r) => r.agent.name).join('|');
  const vacant = plotOf(residents.filter((r) => !r.plot.big).length);
  const rx = Math.max(MIN_RX, ...residents.map((r) => Math.abs(r.plot.x) + 95));
  const season = seasonOf(now);
  const dock = dockOf(rx);
  const jobs = agents?.find((a) => isJobs(a.name));

  const view = useMemo(() => (size ? islandView(size.vw, size.vh, rx, size.dpr) : null), [size, rx]);
  const world = useMemo(
    () => (view && agents ? buildIsland(view, residents.map((r) => ({ ...r.plot, job: jobOf(r.agent.name) })), season, vacant) : null),
    // Baking the ground is slow, so it only follows what changes the land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, names, season],
  );

  useLayoutEffect(() => {
    // Measured outside the scrolling box. Measured inside, its scrollbars change the size they depend on.
    const el = hostRef.current;
    const measure = () => {
      if (el.clientWidth) setSize((old) => (old?.vw === el.clientWidth && old?.vh === el.clientHeight && old?.dpr === devicePixelRatio ? old : { vw: el.clientWidth, vh: el.clientHeight, dpr: devicePixelRatio }));
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  // On a small window the island is bigger than the screen, so start over the town square.
  useLayoutEffect(() => {
    if (!view) return;
    const el = scrollRef.current;
    el.scrollLeft = view.cx * view.s - el.clientWidth / 2;
    el.scrollTop = view.cy * view.s - el.clientHeight / 2;
  }, [view]);

  const seats = house?.live?.seats ?? [];
  const states = residents.map(({ agent }) => (house?.asleep && !live[agent.name]?.busy ? 'asleep' : stateOf(agent, live[agent.name], seats.includes(agent.name), now)));
  const { spot: socialSpot, partner } = socialSeating(residents.filter((_, i) => states[i] === 'social').map((r) => r.agent.name), house?.exchanges);
  const freeNames = residents.filter((_, i) => FREE_FOR_VISIT.has(states[i])).map((r) => r.agent.name).join('|');
  const trip = visit && freeNames.split('|').includes(visit.from) ? visit : null;
  const hostPlot = trip && residents.find((r) => r.agent.name === trip.to)?.plot;
  const plan = residents.map(({ agent, plot }, index) => {
    const state = states[index];
    const angle = (seats.indexOf(agent.name) / Math.max(seats.length, 1)) * Math.PI * 2;
    const seat = { x: Math.cos(angle) * SEAT_RX, y: Math.sin(angle) * SEAT_RY + 6 };
    let goal = null; // null means strolling
    // Real work happens at home only: the moment a task starts, the agent is already inside.
    if (AT_HOME.has(state)) goal = { at: 'door', x: plot.x, y: plot.y + 9, inside: true, now: state === 'working' };
    else if (state === 'meeting') goal = { at: 'plaza', ...seat, dir: seat.y > 0 ? 'up' : 'down' };
    else if (state === 'work') goal = jobSpot(jobOf(agent.name), plot, rx);
    else if (state === 'eat') goal = { at: 'plaza', fx: 'eat', ...EAT_SEATS[index % EAT_SEATS.length] };
    else if (state === 'social') goal = { at: 'plaza', fx: 'chat', ...SOCIAL_SPOTS[socialSpot[agent.name]] };
    else if (state === 'play') goal = { at: 'plaza', fx: 'ball', ...PLAY_SPOTS[index % PLAY_SPOTS.length] };
    // Taking a note or a talk to someone's door: the visitor goes, and the host, if it is free, comes out to meet them.
    const visiting = hostPlot && agent.name === trip.from;
    if (visiting) goal = { at: 'visit', x: hostPlot.x + 9, y: hostPlot.y + 11, dir: 'side', flip: true, fx: trip.kind === 'talk' ? 'chat' : 'letter', via: spokeEnd({ x: hostPlot.x, y: hostPlot.y + 9 }) };
    else if (hostPlot && agent.name === trip.to && FREE_FOR_VISIT.has(state)) goal = { at: 'door', x: hostPlot.x - 4, y: hostPlot.y + 11, dir: 'side', flip: false, fx: trip.kind === 'talk' ? 'chat' : undefined };
    return {
      agent,
      plot,
      state,
      goal,
      status: {
        windows: state === 'asleep' ? 'dark' : state === 'working' || phase !== 'day' ? 'lit' : 'plain',
        smoke: state === 'working',
        zzz: state === 'asleep' || state === 'nap',
        mail: Boolean(live[agent.name]?.unread), // only a reply to the owner, never notes between residents
        boxes: !agent.lastVisit,
      },
      bubble: visiting
        ? { icon: 'letter', text: `${trip.kind === 'talk' ? 'Went to talk with' : 'Taking a note to'} ${shown(trip.to)}: “${trip.gist}”` }
        : bubbleOf(agent, live[agent.name], house, undefined, { asleep: state === 'asleep' || state === 'nap' }),
      words: visiting ? `Visiting ${shown(trip.to)}` : state === 'social' && partner[agent.name] ? `Chatting with ${shown(partner[agent.name])}` : wordsFor(state, agent.name),
    };
  });
  const planRef = useRef(plan);
  planRef.current = plan;
  // The next visit: the oldest fresh exchange nobody has walked yet, once its sender is free to go.
  useEffect(() => {
    if (!active) return;
    if (visit) {
      if (!freeNames.split('|').includes(visit.from)) setVisit(null); // it got busy, so the visit waits for another time
      return;
    }
    seenRef.current ??= loadSeen();
    const now = Date.now();
    const next = (house?.exchanges ?? [])
      .filter((e) => e.at > now - VISIT_WINDOW_MS && !seenRef.current.has(e.id) && freeNames.split('|').includes(e.from) && residents.some((r) => r.agent.name === e.to))
      .sort((a, b) => a.at - b.at)[0];
    if (next) {
      arrivedRef.current = 0;
      setVisit(next);
    }
  }, [active, visit, freeNames, house?.exchanges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real achievements get a party.
  const partyRef = useRef(null);
  partyRef.current = {
    fireworks: Boolean(house?.goals.length) && house.goals.every((g) => g.done) && (phase === 'dusk' || phase === 'night'),
    houses: residents.filter((r) => r.agent.unwrapped > 0).map(({ agent, plot }) => ({ x: plot.x, y: plot.y - houseSprite(lookOf(agent.name), Boolean(plot.big)).H })),
    dock: Boolean(partyJob(house)),
  };
  const sailingRef = useRef([]);
  sailingRef.current = [house?.news?.busy, house?.jobs?.busy];

  useEffect(() => {
    if (!active || !world || !view) return undefined;
    const g = canvasRef.current.getContext('2d');
    const still = reducedMotion();
    let last = performance.now();
    // Signs never hide anyone: a plaque fades while a resident stands or walks under it. Measured once a second, since signs don't move.
    let plaques = [];
    let measured = -Infinity;
    const measure = () => {
      const origin = worldRef.current.getBoundingClientRect();
      plaques = [...worldRef.current.querySelectorAll('.plaque')].map((el) => {
        const r = el.getBoundingClientRect();
        return { el, l: r.left - origin.left, t: r.top - origin.top, r: r.right - origin.left, b: r.bottom - origin.top };
      });
    };
    const frame = () => {
      const ms = performance.now();
      const dt = Math.min(0.4, (ms - last) / 1000);
      last = ms;
      const { s, cx, cy } = view;
      const actors = [];
      const people = [];
      const stride = still ? 1 : dt * SAIL_RATE;
      voyages.current.forEach((voyage, i) => {
        const heading = sailingRef.current[i] ? 1 : 0;
        voyage.flip = voyage.t > heading;
        voyage.t = heading > voyage.t ? Math.min(heading, voyage.t + stride) : Math.max(heading, voyage.t - stride);
      });
      const crier = personSprite(lookOf(REPORTER), 'down', 0);
      const riders = [crier, jobs && personSprite(lookOf(jobs.name), 'down', 0)];
      if (!voyages.current[0].t && phase !== 'night') actors.push({ c: crier, x: cx + dock.news.x, y: cy + dock.news.y });
      planRef.current.forEach((r, seed) => {
        const name = r.agent.name;
        const look = lookOf(name);
        const npc = (npcs.current[name] ??= newNpc(r.plot));
        const step = stepNpc(npc, r, dt, ms, still);
        const aboard = isJobs(name) && voyages.current[1].t > 0;
        actors.push({ house: true, sprite: houseSprite(look, Boolean(r.plot.big)), status: r.status, x: cx + r.plot.x, y: cy + r.plot.y });
        const el = npcEls.current[name];
        if (el) {
          el.style.display = npc.inside || aboard ? 'none' : '';
          el.style.transform = `translate(${Math.round(cx + npc.x - 8) * s}px, ${Math.round(cy + npc.y - 20) * s}px)`;
        }
        if (!npc.inside && !aboard) {
          const fx = npc.arrive?.fx === 'letter' ? 'letter' : npc.walking ? null : npc.arrive?.fx; // a letter is carried the whole way
          const speaking = r.state === 'meeting' && house?.live?.speaker === name;
          const hop = speaking && Math.floor(ms / 300) % 2 ? 2 : BOBBING.has(fx) && Math.floor(ms / 280) % 2 ? 1 : 0;
          const st = npc.arrive?.st;
          actors.push({ c: personSprite(look, npc.dir, step), x: cx + npc.x, y: cy + npc.y - hop, flip: npc.flip, dir: npc.dir, fx, seed, st: st && { x: cx + st.x, y: cy + st.y } });
          people.push({ l: (cx + npc.x - 7) * s, r: (cx + npc.x + 7) * s, t: (cy + npc.y - 20) * s, b: (cy + npc.y) * s });
        }
      });
      if (ms - measured > 1000) {
        measure();
        measured = ms;
      }
      plaques.forEach((p) => p.el.toggleAttribute('data-under', people.some((q) => q.l < p.r && q.r > p.l && q.t < p.b && q.b > p.t)));
      // Whoever took a note or a talk stays a while at the door, then the visit is over.
      const going = visitRef.current;
      const walker = going && npcs.current[going.from];
      if (walker && !walker.path.length && walker.loc === 'visit' && walker.arrive?.at === 'visit') {
        arrivedRef.current ||= ms;
        if (ms - arrivedRef.current > VISIT_STAY_MS) {
          seenRef.current.add(going.id);
          saveSeen(seenRef.current);
          arrivedRef.current = 0;
          setVisit(null);
        }
      }
      const party = partyRef.current;
      const celebration = {
        fireworks: party.fireworks ? { x: cx, y: cy } : null,
        confetti: party.houses.map((h) => ({ x: cx + h.x, y: cy + h.y })),
        bunting: party.dock ? { x: cx + dock.stall.x, y: cy + dock.stall.y } : null,
      };
      drawIsland(g, world, actors, phase, still ? 0 : ms, voyages.current.map((v, i) => ({ ...v, rider: riders[i] })), celebration);
      if (god) drawGod(g, world, lookOf(god.name), cx, cy + view.godY, still ? 0 : ms);
    };
    frame();
    if (still) {
      const id = setInterval(frame, 1000);
      return () => clearInterval(id);
    }
    let raf;
    let drawn = last;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - drawn < FRAME_MS) return;
      drawn = t;
      frame();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, world, view, phase, god?.name, jobs?.name, house?.live?.speaker]); // eslint-disable-line react-hooks/exhaustive-deps

  const news = useMemo(() => newsOf(agents, house, live), [agents, house, live]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICKER_MS);
    return () => clearInterval(id);
  }, []);

  // The first look of the day opens on the paper.
  useEffect(() => {
    if (!active || !agents?.length || !house) return;
    try {
      if (localStorage.getItem(PAPER_KEY) === house.today) return;
      localStorage.setItem(PAPER_KEY, house.today);
    } catch { /* private window: the paper just shows each time */ }
    setPaper(true);
  }, [active, agents?.length, house?.today]); // eslint-disable-line react-hooks/exhaustive-deps

  const goalsDone = house?.goals.filter((g) => g.done).length ?? 0;
  const goalsTotal = house?.goals.length ?? 0;
  const headline = news.length ? news[tick % news.length] : null;
  const box = (x, y, w, h) => ({ left: (view.cx + x) * view.s, top: (view.cy + y) * view.s, width: w * view.s, height: h * view.s });
  const go = (place, e, room) => {
    setPaper(false);
    if (place === NEWS) setDispatch(true);
    else onGo(place, e, room);
  };
  const crierBubble = reporterBubble(house?.news, house?.today);

  return (
    <div className="island" ref={hostRef}>
      <div className="island-view" ref={scrollRef} style={{ overflow: view?.pans ? 'auto' : 'hidden' }}>
        {view && (
          <div className="world" ref={worldRef} style={{ width: view.LW * view.s, height: view.LH * view.s }}>
            <canvas ref={canvasRef} width={view.LW} height={view.LH} />
            {house && (
              <button type="button" className="spot spot-square" style={box(-74, -40, 148, 80)} onClick={(e) => go(COMMON, e)} aria-label={`Town square. ${goalsDone} of ${goalsTotal} weekly goals done.`}>
                <span className="plaque">Town square</span>
              </button>
            )}
            {plan.map(({ agent, plot, state, bubble, words }) => {
              const { W, H } = houseSprite(lookOf(agent.name), Boolean(plot.big));
              const home = AT_HOME.has(state);
              return (
                <button
                  type="button"
                  key={agent.name}
                  className="spot"
                  style={box(plot.x - W / 2, plot.y - H, W, H)}
                  onClick={(e) => go(agent.name, e)}
                  aria-label={`${shown(agent.name)}. ${words}.${bubble ? ` ${bubble.text}.` : ''}`}
                >
                  {home && bubble && <Think bubble={bubble} />}
                  <span className="plaque">{shown(agent.name)}</span>
                </button>
              );
            })}
            {plan.map(({ agent, state, bubble, words }) => (
              <button
                type="button"
                key={agent.name}
                className="npc"
                tabIndex={-1}
                aria-hidden="true"
                ref={(el) => { if (el) npcEls.current[agent.name] = el; }}
                style={{ width: 16 * view.s, height: 20 * view.s }}
                onClick={(e) => go(agent.name, e)}
              >
                {!AT_HOME.has(state) && bubble && <Think bubble={bubble} />}
                <span className="npc-tag">{shown(agent.name)}: {words}</span>
              </button>
            ))}
            {agents && (
              <div className="spot spot-vacant" style={box(vacant.x - 30, vacant.y - 40, 60, 40)}>
                <span className="think"><span className="think-text">Make a folder in agents and someone moves in here.</span></span>
                <span className="plaque">Empty plot</span>
              </div>
            )}
            {house && (
              <button type="button" className="spot spot-news" style={phase === 'night' ? box(dock.boats[0].x - 17, dock.boats[0].y - 28, 34, 28) : box(dock.news.x - 11, dock.news.y - 22, 22, 24)} onClick={(e) => go(NEWS, e)} aria-label={`News from the dock${phase === 'night' ? ", on the crier's boat" : ''}.${crierBubble ? ` ${crierBubble.text}.` : ''}`}>
                {crierBubble && <Think bubble={crierBubble} />}
                <span className="plaque">News</span>
              </button>
            )}
            {jobs && (
              <button type="button" className="spot spot-dock" style={box(dock.stall.x - 12, dock.stall.y - 22, 24, 24)} onClick={(e) => go(jobs.name, e, 'port')} aria-label={`${shown(jobs.name)}' port`}>
                {house?.jobs?.busy && <Think bubble={{ icon: 'dots', text: 'At sea, looking for openings' }} />}
                <span className="plaque">Port</span>
              </button>
            )}
            {god && (() => {
              const bubble = bubbleOf(god, live[god.name], house);
              return (
                <button type="button" className="spot" style={box(-36, view.godY - 40, 72, 42)} onClick={(e) => go(god.name, e)} aria-label={`${shown(god.name)}, on a cloud above the sea.${bubble ? ` ${bubble.text}.` : ''}`}>
                  {bubble && <Think bubble={bubble} />}
                  <span className="plaque">{shown(god.name)}</span>
                </button>
              );
            })()}
          </div>
        )}
      </div>

      <header className="hud-left frame">
        <h1>Agent House</h1>
        <p>
          <span>{now.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <b>{now.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</b>
        </p>
        {house?.asleep && <p role="status">Everyone is asleep: Claude limit at 100%. They wake up at {new Date(house.asleep).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}.</p>}
      </header>

      {house && (
        <button type="button" className="hud-right frame" onClick={(e) => go(COMMON, e)} aria-label={`Weekly goals: ${goalsDone} of ${goalsTotal} done. Open the square.`}>
          <span>Weekly goals</span>
          <span className="bar"><i style={{ width: `${goalsTotal ? (goalsDone / goalsTotal) * 100 : 0}%` }} /></span>
          <b>{goalsDone}/{goalsTotal}</b>
        </button>
      )}

      {agents?.length === 0 && (
        <section className="nobody frame">
          <h2>Nobody lives here yet</h2>
          <p>Make a folder inside <b>agents</b> and someone moves in within seconds.</p>
        </section>
      )}

      {agents?.length > 0 && (
        <footer className="dock">
          {headline && (
            <button type="button" className="ticker frame" onClick={() => setPaper(true)} aria-label={`Open today's news. ${headline.text}`}>
              <b>News</b>
              <span key={headline.text}>{headline.text}</span>
            </button>
          )}
          <nav className="roster" aria-label="Residents">
            {agents.filter((a) => !isGod(a.name)).map((a) => {
              const bubble = bubbleOf(a, live[a.name], house);
              return (
                <button type="button" key={a.name} className="face-btn" onClick={(e) => go(a.name, e)} aria-label={`${shown(a.name)}${bubble ? `. ${bubble.text}` : ''}`}>
                  <img src={portraitUrl(lookOf(a.name), moodOf(a, live[a.name]))} alt="" width={48} height={60} />
                  {bubble && <span className="face-mark"><Icon name={bubble.icon} /></span>}
                  <b>{shown(a.name)}</b>
                </button>
              );
            })}
          </nav>
        </footer>
      )}

      <Paper open={paper && active} news={news} today={house?.today} onClose={() => setPaper(false)} onGo={go} />
      <Dispatch open={dispatch && active} news={house?.news} onMore={onMoreNews} onClose={() => setDispatch(false)} />
    </div>
  );
}
