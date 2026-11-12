// What the island shows about a resident. Every word here comes from real data. Shared with tests, so no DOM.
import { shown } from './layout.js';
export const COMMON = '_common'; // underscore: can never be a resident's name
export const NEWS = '_news'; // the reporter's paper on the dock
export const REPORTER = 'Crier';
export const isJobs = (name) => /^jobs$/i.test(name); // the one resident with a boat, a board of openings and an interview room
export const isGod = (name) => /^god$/i.test(name);
export const isMayor = (name) => /^mayor$/i.test(name);
export const isEngineer = (name) => /^engineer$/i.test(name);

const LONG_ABSENCE_DAYS = 3;
const GOOD_STREAK = 3;
const DREAM_MS = 20 * 36e5; // a sleeper dreams of a chat that is no older than this
const PARTY_MS = 3 * 864e5; // an interview or an offer is celebrated this long
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

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

// Hour each part of the day starts, and what someone may do then. Each resident rolls again every hour,
// so the schedule holds but the afternoon isn't the same for everyone. Repeats weigh an option.
// Ambience only: it never says anything about the agent's real work.
const DAY = [
  [0, ['asleep']],
  [6, ['stroll', 'stroll', 'jog']],
  [7.5, ['eat']],
  [8.5, ['work', 'work', 'work', 'work', 'social']],
  [12, ['eat']],
  [13, ['work', 'work', 'work', 'social', 'nap', 'play', 'jog']],
  [17, ['social', 'social', 'play', 'jog', 'stroll']],
  [19, ['eat']],
  [20, ['stroll', 'social', 'social']],
  [23, ['asleep']],
];
const staggerOf = (name) => [...name].reduce((sum, c) => sum + c.codePointAt(0), 0) % 31; // minutes, so nobody moves in lockstep
const hashOf = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261); // FNV-1a

export function routineOf(name, date = new Date()) {
  const hour = (date.getHours() + (date.getMinutes() - staggerOf(name)) / 60 + 24) % 24;
  const options = DAY.findLast(([from]) => from <= hour)[1];
  // Same name, day and hour, same answer: re-renders and reloads don't reshuffle anyone.
  return options[hashOf(`${name}|${date.toDateString()}|${Math.floor(hour)}`) % options.length];
}

/** Real work and meetings always win over the routine. */
export function stateOf(agent, live, inMeeting, date = new Date()) {
  if (live?.busy) return 'working';
  if (inMeeting) return 'meeting';
  return routineOf(agent.name, date);
}

const STATE_WORDS = { working: 'Working', meeting: 'At the town meeting', asleep: 'Sleeping', eat: 'Eating', social: 'Chatting in the square', stroll: 'Out for a walk', nap: 'Taking a nap', play: 'Playing ball', jog: 'Out for a run' };
const JOB_WORDS = { board: 'At the notice board', bench: 'At the workbench', music: 'Practising music', teach: 'At the blackboard', books: 'Reading', garden: 'Tending the garden', ledger: 'Counting coins', dock: 'At the dock stall' };
export const wordsFor = (state, name) => (state === 'work' ? JOB_WORDS[jobOf(name)] : STATE_WORDS[state]);

/** What someone asleep dreams of: the last thing it got done today, or else the chat it last had. Nothing made up. */
export function dreamOf(agent, today, now = Date.now()) {
  const done = agent.today?.date?.startsWith(today) ? agent.today.items.filter((i) => i.status === 'done') : [];
  const topic = done.length ? done.at(-1).text : agent.lastChat && now - agent.lastChat.at < DREAM_MS ? agent.lastChat.title : null;
  return topic ? { icon: 'moon', text: `Dreaming of “${topic.slice(0, 60)}”` } : null;
}

/** Residents out chatting who really have been in touch this week end up side by side. Returns the pairs, strongest tie first. */
export function pairUp(names, exchanges = []) {
  const tie = (a, b) => exchanges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)).length;
  const left = [...names].sort();
  const pairs = [];
  for (;;) {
    let best = null;
    for (let i = 0; i < left.length; i++) {
      for (let j = i + 1; j < left.length; j++) {
        const weight = tie(left[i], left[j]);
        if (weight > 0 && (!best || weight > best.weight)) best = { weight, i, j };
      }
    }
    if (!best) return pairs;
    pairs.push([left[best.i], left[best.j]]);
    left.splice(best.j, 1);
    left.splice(best.i, 1);
  }
}

/** The job being celebrated: an interview or an offer the owner set in the last few days. */
export const partyJob = (house, now = Date.now()) => house?.jobs?.items
  ?.filter((j) => (j.status === 'interview' || j.status === 'offer') && j.changed > now - PARTY_MS)
  .sort((a, b) => b.changed - a.changed)[0] ?? null;
const partyText = (job) => `${job.status === 'offer' ? 'An offer' : 'An interview'} at ${job.company || job.title}!`;

/** The one thing on a resident's mind, most urgent first, or null. */
export function bubbleOf(agent, live = {}, house, now = Date.now(), { asleep = false } = {}) {
  if (live.error) return { icon: 'alert', text: 'Something went wrong. Drop by to see what happened.' };
  const call = house?.calls?.find((c) => c.agent === agent.name);
  if (call) return { icon: 'phone', text: call.status === 'missed' ? 'Missed call' : 'Calling you', ring: call.status === 'ringing' };
  if (live.unread) return { icon: 'letter', text: 'Has a reply for you' };
  const dream = asleep && dreamOf(agent, house?.today, now);
  if (dream) return dream;
  if (live.busy) return { icon: 'dots', text: live.activity || 'Thinking' };
  if (house?.live?.speaker === agent.name) return { icon: 'dots', text: 'Has the floor' };
  const party = isJobs(agent.name) && partyJob(house, now);
  if (party) return { icon: 'star', text: partyText(party) };
  if (agent.unwrapped > 0) return { icon: 'star', text: `Reached level ${agent.level}!` };
  const bumped = house?.events.find((e) => e.by === agent.name && e.bumped && e.day >= house.today);
  if (bumped) return { icon: 'calendar', text: `“${bumped.title}” was bumped` };
  if (isMayor(agent.name) && !agent.visitedToday) return { icon: 'alert', text: 'No check-in yet today' };
  const open = agent.today?.items.find((i) => i.status === 'open');
  if (open) return { icon: 'list', text: `Next: ${open.text}` };
  if (agent.misses) return { icon: 'cloud', text: `${agent.misses} missed this week` };
  if (!agent.lastVisit) return { icon: 'hi', text: 'Just moved in' };
  if (agent.streak >= GOOD_STREAK) return { icon: 'star', text: `${agent.streak}-day streak` };
  const away = Math.floor((now - agent.lastVisit) / 864e5);
  if (away >= LONG_ABSENCE_DAYS) return { icon: 'zzz', text: `Last talked ${away} days ago` };
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
  if (news?.busy) return { icon: 'dots', text: 'At sea, looking for news' };
  if (news?.items.length && news.day === today) return { icon: 'letter', text: `${plural(news.items.length, 'story', 'stories')} today` };
  return null;
}

/** Today's headlines. `who` is where clicking one takes you. */
export function newsOf(agents, house, live = {}) {
  if (!agents || !house) return [];
  const lines = [];
  const add = (text, who) => lines.push({ text, who });
  if (house.live) add(house.live.speaker ? `Town meeting in progress. ${shown(house.live.speaker)} has the floor.` : 'Town meeting in progress.', COMMON);

  const mayor = agents.find((a) => isMayor(a.name));
  if (mayor && !mayor.visitedToday) add(`${shown(mayor.name)} is waiting for today's check-in.`, mayor.name);

  if (house.news?.day === house.today && house.news.items.length) add(`The dock has ${plural(house.news.items.length, 'story', 'stories')} today.`, NEWS);

  const fresh = house.jobs?.items.filter((j) => j.status === 'new').length;
  const jobs = agents.find((a) => isJobs(a.name));
  if (jobs && fresh) add(`${shown(jobs.name)} brought back ${plural(fresh, 'opening')} to review.`, jobs.name);

  const party = partyJob(house);
  if (jobs && party) add(`${shown(jobs.name)}: ${partyText(party)}`, jobs.name);

  for (const a of agents) {
    if (a.unwrapped > 0) add(`${shown(a.name)} reached level ${a.level}. Drop by with a gift.`, a.name);
    const call = house.calls?.find((c) => c.agent === a.name);
    if (call) add(`${shown(a.name)} ${call.status === 'missed' ? 'called and you missed it' : 'is calling you'}: ${call.why}`, a.name);
    if (live[a.name]?.unread) add(`${shown(a.name)} has a reply for you.`, a.name);
    const items = a.today?.items ?? [];
    if (items.length) add(`${shown(a.name)}: ${items.filter((i) => i.status === 'done').length} of ${items.length} done today.`, a.name);
    if (a.misses) add(`${shown(a.name)}: ${a.misses} missed this week.`, a.name);
    if (!a.lastVisit) add(`${shown(a.name)} just moved in. Drop by and say hi.`, a.name);
  }

  house.events
    .filter((e) => e.day === house.today && !e.bumped)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .forEach((e) => add(`Today${e.time ? ` at ${e.time}` : ''}: ${e.title}.`, COMMON));
  house.events
    .filter((e) => e.bumped && e.day >= house.today)
    .forEach((e) => add(`“${e.title}” was bumped from the calendar.`, COMMON));

  if (house.goals.length) add(`Weekly goals: ${house.goals.filter((g) => g.done).length} of ${house.goals.length} done.`, COMMON);

  const best = agents.reduce((top, a) => (a.streak > (top?.streak ?? 0) ? a : top), null);
  if (best?.streak >= GOOD_STREAK) add(`${shown(best.name)} is on a ${best.streak}-day streak.`, best.name);

  return lines.length ? lines : [{ text: 'A quiet day on the island. Nothing on the agenda.', who: COMMON }];
}
