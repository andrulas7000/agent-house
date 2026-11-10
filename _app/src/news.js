// What the island shows about a resident. Every word here comes from real data. Shared with tests, so no DOM.
import { shown } from './layout.js';
export const COMMON = '_common'; // underscore: can never be a resident's name
export const NEWS = '_news'; // the reporter's paper on the dock
export const REPORTER = 'Pregonero';
export const isJobs = (name) => /^jobs$/i.test(name); // the one resident with a boat, a board of openings and an interview room
export const isGod = (name) => /^god$/i.test(name);
export const isMayor = (name) => /^mayor$/i.test(name);
export const isEngineer = (name) => /^engineer$/i.test(name);

const LONG_ABSENCE_DAYS = 3;
const GOOD_STREAK = 3;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function phaseOf(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** What a resident does for work when nothing real is going on. Follows the folder's name. */
export function jobOf(name) {
  if (isMayor(name)) return 'board';
  if (/engin|code|dev/i.test(name)) return 'bench';
  if (/music|song|audio/i.test(name)) return 'music';
  if (/tutor|teach/i.test(name)) return 'teach';
  if (/study|school|office/i.test(name)) return 'books';
  if (isJobs(name)) return 'dock';
  if (/money|bank/i.test(name)) return 'ledger';
  return 'garden';
}

// Hour each part of the day starts. Ambience only: it never says anything about the agent's real work.
const DAY = [[0, 'asleep'], [6, 'stroll'], [7.5, 'eat'], [8.5, 'work'], [12, 'eat'], [13, 'work'], [17, 'social'], [19, 'eat'], [20, 'stroll'], [23, 'asleep']];
const staggerOf = (name) => [...name].reduce((sum, c) => sum + c.codePointAt(0), 0) % 31; // minutes, so nobody moves in lockstep

export function routineOf(name, date = new Date()) {
  const hour = (date.getHours() + (date.getMinutes() - staggerOf(name)) / 60 + 24) % 24;
  return DAY.findLast(([from]) => from <= hour)[1];
}

/** Real work and meetings always win over the routine. */
export function stateOf(agent, live, inMeeting, date = new Date()) {
  if (live?.busy) return 'working';
  if (inMeeting) return 'meeting';
  return routineOf(agent.name, date);
}

const STATE_WORDS = { working: 'Trabajando', meeting: 'En la reunión del pueblo', asleep: 'Durmiendo', eat: 'Comiendo', social: 'Charlando en la plaza', stroll: 'Dando un paseo' };
const JOB_WORDS = { board: 'En el tablón de anuncios', bench: 'En el banco de trabajo', music: 'Practicando música', teach: 'En la pizarra', books: 'Leyendo', garden: 'Cuidando el huerto', ledger: 'Contando monedas', dock: 'En su puesto del muelle' };
export const wordsFor = (state, name) => (state === 'work' ? JOB_WORDS[jobOf(name)] : STATE_WORDS[state]);

/** The one thing on a resident's mind, most urgent first, or null. */
export function bubbleOf(agent, live = {}, house, now = Date.now()) {
  if (live.error) return { icon: 'alert', text: 'Algo salió mal. Pasa a ver qué ocurrió.' };
  if (live.unread) return { icon: 'letter', text: 'Tiene una respuesta para ti' };
  if (live.busy) return { icon: 'dots', text: live.activity || 'Pensando' };
  if (house?.live?.speaker === agent.name) return { icon: 'dots', text: 'Tiene la palabra' };
  if (agent.waiting) return { icon: 'letter', text: `${plural(agent.waiting, 'nota')} en espera` };
  const bumped = house?.events.find((e) => e.by === agent.name && e.bumped && e.day >= house.today);
  if (bumped) return { icon: 'calendar', text: `“${bumped.title}” fue desplazado` };
  if (isMayor(agent.name) && !agent.visitedToday) return { icon: 'alert', text: 'Hoy aún no hay check-in' };
  const open = agent.today?.items.find((i) => i.status === 'open');
  if (open) return { icon: 'list', text: `Siguiente: ${open.text}` };
  if (agent.misses) return { icon: 'cloud', text: `${agent.misses} sin cumplir esta semana` };
  if (!agent.lastVisit) return { icon: 'hi', text: 'Acaba de mudarse' };
  if (agent.streak >= GOOD_STREAK) return { icon: 'star', text: `Racha de ${agent.streak} días` };
  const away = Math.floor((now - agent.lastVisit) / 864e5);
  if (away >= LONG_ABSENCE_DAYS) return { icon: 'zzz', text: `Última charla hace ${away} días` };
  return null;
}

/** A face that matches the facts: worried about misses, pleased about a streak. */
export function moodOf(agent, live = {}) {
  if (live.busy) return 'neutral';
  if (live.error || agent.misses) return 'worried';
  const items = agent.today?.items ?? [];
  if (agent.streak >= GOOD_STREAK || (items.length && items.every((i) => i.status === 'done'))) return 'happy';
  return 'neutral';
}

/** What the reporter on the dock has to say. Only ever about his real paper. */
export function reporterBubble(news, today) {
  if (news?.busy) return { icon: 'dots', text: 'En el mar, buscando noticias' };
  if (news?.items.length && news.day === today) return { icon: 'letter', text: `${plural(news.items.length, 'noticia')} de hoy` };
  return null;
}

/** Today's headlines. `who` is where clicking one takes you. */
export function newsOf(agents, house, live = {}) {
  if (!agents || !house) return [];
  const lines = [];
  const add = (text, who) => lines.push({ text, who });
  if (house.live) add(house.live.speaker ? `Reunión del pueblo en curso. ${shown(house.live.speaker)} tiene la palabra.` : 'Reunión del pueblo en curso.', COMMON);

  const mayor = agents.find((a) => isMayor(a.name));
  if (mayor && !mayor.visitedToday) add(`${shown(mayor.name)} espera el check-in de hoy.`, mayor.name);

  if (house.news?.day === house.today && house.news.items.length) add(`El muelle tiene ${plural(house.news.items.length, 'noticia')} de hoy.`, NEWS);

  const fresh = house.jobs?.items.filter((j) => j.status === 'nuevo').length;
  const jobs = agents.find((a) => isJobs(a.name));
  if (jobs && fresh) add(`${shown(jobs.name)} trajo ${plural(fresh, 'trabajo')} sin revisar.`, jobs.name);

  for (const a of agents) {
    if (live[a.name]?.unread) add(`${shown(a.name)} tiene una respuesta para ti.`, a.name);
    if (a.waiting) add(`${shown(a.name)} tiene ${plural(a.waiting, 'nota')} en espera.`, a.name);
    const items = a.today?.items ?? [];
    if (items.length) add(`${shown(a.name)}: ${items.filter((i) => i.status === 'done').length} de ${items.length} hechas hoy.`, a.name);
    if (a.misses) add(`${shown(a.name)}: ${a.misses} sin cumplir esta semana.`, a.name);
    if (!a.lastVisit) add(`${shown(a.name)} acaba de mudarse. Pasa a saludar.`, a.name);
  }

  house.events
    .filter((e) => e.day === house.today && !e.bumped)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .forEach((e) => add(`Hoy${e.time ? ` a las ${e.time}` : ''}: ${e.title}.`, COMMON));
  house.events
    .filter((e) => e.bumped && e.day >= house.today)
    .forEach((e) => add(`“${e.title}” fue desplazado del calendario.`, COMMON));

  if (house.goals.length) add(`Metas de la semana: ${house.goals.filter((g) => g.done).length} de ${house.goals.length} hechas.`, COMMON);

  const best = agents.reduce((top, a) => (a.streak > (top?.streak ?? 0) ? a : top), null);
  if (best?.streak >= GOOD_STREAK) add(`${shown(best.name)} lleva una racha de ${best.streak} días.`, best.name);

  return lines.length ? lines : [{ text: 'Un día tranquilo en la isla. Nada en la agenda.', who: COMMON }];
}
