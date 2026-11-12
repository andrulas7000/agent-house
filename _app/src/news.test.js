import test from 'node:test';
import assert from 'node:assert/strict';
import { bubbleOf, dreamOf, jobOf, moodOf, newsOf, pairUp, partyJob, routineOf, stateOf, wordsFor } from './news.js';

const agent = (over) => ({ name: 'Study', lastVisit: Date.now(), streak: 0, misses: 0, waiting: 0, today: null, visitedToday: true, ...over });
const house = (over) => ({ today: '2026-11-09', events: [], goals: [], live: null, ...over });

test('a bubble shows the most urgent true thing', () => {
  const busy = agent({ waiting: 2, misses: 1 });
  assert.equal(bubbleOf(busy, { busy: true, activity: 'Reading STATE.md' }, house()).text, 'Reading STATE.md');
  assert.equal(bubbleOf(busy, {}, house()).text, '1 missed this week', 'notes between residents are not for the owner');
  assert.equal(bubbleOf(agent({ misses: 1 }), {}, house()).text, '1 missed this week');
  assert.equal(bubbleOf(agent(), {}, house()), null);
});

test('only Mayor nags about the check-in', () => {
  assert.equal(bubbleOf(agent({ name: 'Mayor', visitedToday: false }), {}, house()).text, 'No check-in yet today');
  assert.equal(bubbleOf(agent({ visitedToday: false }), {}, house()), null);
});

test('a bumped block only counts while it is still ahead', () => {
  const event = { by: 'Study', title: 'Essay', bumped: 'Mayor', day: '2026-11-10' };
  assert.match(bubbleOf(agent(), {}, house({ events: [event] })).text, /Essay/);
  assert.equal(bubbleOf(agent(), {}, house({ events: [{ ...event, day: '2026-11-01' }] })), null);
});

test('the clock runs a villager day, and real work always wins', () => {
  const at = (h, m = 45) => new Date(2026, 10, 9, h, m);
  const study = agent();
  assert.equal(stateOf(study, {}, false, at(2)), 'asleep');
  assert.equal(stateOf(study, {}, false, at(12)), 'eat');
  assert.equal(stateOf(study, { busy: true }, false, at(2)), 'working');
  assert.equal(stateOf(study, {}, true, at(2)), 'meeting');
  assert.equal(stateOf(agent({ lastVisit: null }), {}, false, at(10)), routineOf('Study', at(10)), 'newcomers join in');
});

test('the schedule holds, but each day and hour mixes it up', () => {
  const names = ['Mayor', 'Tutoring', 'Music', 'Engineer', 'Jobs', 'Money'];
  const days = Array.from({ length: 20 }, (_, d) => d + 1);
  const all = (h, m = 45) => names.flatMap((n) => days.map((d) => routineOf(n, new Date(2026, 10, d, h, m))));
  const share = (list, state) => list.filter((s) => s === state).length / list.length;
  assert.ok(all(3).every((s) => s === 'asleep') && all(12).every((s) => s === 'eat'), 'nights and meals never move');
  assert.ok(share(all(10), 'work') > 0.6, 'mornings are still mostly work');
  const afternoon = [...all(14), ...all(15)];
  for (const state of ['work', 'social', 'nap', 'play', 'jog']) assert.ok(share(afternoon, state) > 0.05, `someone is out to ${state} in the afternoon`);
  assert.ok(share(afternoon, 'work') > share(afternoon, 'nap'), 'work still leads the afternoon');
  assert.equal(routineOf('Music', new Date(2026, 10, 9, 15, 40)), routineOf('Music', new Date(2026, 10, 9, 15, 45)), 'it holds still within the hour');
  assert.ok(['nap', 'play', 'jog'].every((s) => wordsFor(s, 'Music')), 'every new state has words');
});

test('residents start and stop at slightly different times', () => {
  const names = ['Mayor', 'Tutoring', 'Study', 'Music', 'Engineer'];
  const splitsUp = Array.from({ length: 31 }, (_, minute) => names.map((name) => routineOf(name, new Date(2026, 10, 9, 12, minute))));
  assert.ok(splitsUp.some((states) => states.includes('eat') && states.some((s) => s !== 'eat')), 'some leave for lunch before others');
});

test('jobs follow the folder name', () => {
  assert.deepEqual(['Mayor', 'Engineer', 'Music', 'Tutoring', 'Study', 'Gardener', 'Money', 'Jobs'].map(jobOf), ['board', 'bench', 'music', 'teach', 'books', 'garden', 'ledger', 'dock']);
  assert.equal(wordsFor('work', 'Engineer'), 'At the workbench');
  assert.equal(wordsFor('eat', 'Engineer'), 'Eating');
});

test('moods follow the facts', () => {
  assert.equal(moodOf(agent({ misses: 2 })), 'worried');
  assert.equal(moodOf(agent({ streak: 5 })), 'happy');
  assert.equal(moodOf(agent()), 'neutral');
});

test('the news never invents a story', () => {
  assert.deepEqual(newsOf([agent()], house()).map((l) => l.text), ['A quiet day on the island. Nothing on the agenda.']);
  const lines = newsOf([agent({ name: 'Mayor', visitedToday: false })], house({ events: [{ title: 'Tutoring', day: '2026-11-09', time: '18:30' }] })).map((l) => l.text);
  assert.deepEqual(lines, ['Mayor is waiting for today\'s check-in.', 'Today at 18:30: Tutoring.']);
});

test('a call outranks everything but an error, and shows up in the news', () => {
  const calling = house({ calls: [{ id: 7, agent: 'Study', kind: 'block', why: 'Review the thesis', status: 'ringing' }] });
  assert.deepEqual(bubbleOf(agent(), { unread: true }, calling), { icon: 'phone', text: 'Calling you', ring: true });
  assert.equal(bubbleOf(agent(), { error: 'x' }, calling).icon, 'alert');
  assert.equal(bubbleOf(agent({ name: 'Music' }), {}, calling), null, 'only the one who called');
  const missed = house({ calls: [{ id: 7, agent: 'Study', kind: 'urgent', why: 'Needs your signature', status: 'missed' }] });
  assert.deepEqual(bubbleOf(agent(), {}, missed), { icon: 'phone', text: 'Missed call', ring: false });
  assert.match(newsOf([agent()], calling).map((l) => l.text).join('\n'), /Study is calling you: Review the thesis/);
});

test('a level-up, an interview and a dream each get a bubble, after real work', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const up = agent({ level: 3, unwrapped: 1 });
  assert.deepEqual(bubbleOf(up, {}, house()), { icon: 'star', text: 'Reached level 3!' });
  assert.equal(bubbleOf(up, { busy: true, activity: 'x' }, house()).icon, 'dots', 'work comes first');
  assert.match(newsOf([up], house()).map((l) => l.text).join('\n'), /Study reached level 3/);

  const interview = house({ jobs: { items: [{ status: 'interview', company: 'Acme', title: 'RA', changed: now - 864e5 }] } });
  assert.equal(bubbleOf(agent({ name: 'Jobs' }), {}, interview, now).text, 'An interview at Acme!');
  assert.equal(bubbleOf(agent(), {}, interview, now), null, 'only Jobs celebrates it');
  assert.equal(partyJob(interview, now + 4 * 864e5), null, 'three days, then it is old news');

  const sleeper = agent({ today: { date: '2026-11-09', items: [{ text: 'Finish the report', status: 'done' }, { text: 'Another', status: 'open' }] } });
  assert.equal(bubbleOf(sleeper, {}, house(), now, { asleep: true }).text, 'Dreaming of “Finish the report”');
  assert.equal(bubbleOf(sleeper, {}, house(), now).icon, 'list', 'awake, it thinks about what is next');
  const stale = agent({ today: { date: '2026-11-01', items: [{ text: 'Old', status: 'done' }] }, lastChat: { title: 'Review the thesis', at: now - 2 * 36e5 } });
  assert.equal(dreamOf(stale, '2026-11-09', now).text, 'Dreaming of “Review the thesis”', 'an old list is not a dream');
  assert.equal(dreamOf(agent({ lastChat: { title: 'x', at: now - 30 * 36e5 } }), '2026-11-09', now), null, 'nothing recent, nothing to dream');
});

test('chatters pair up by who really got in touch', () => {
  const exchanges = [{ from: 'Mayor', to: 'Music' }, { from: 'Music', to: 'Mayor' }, { from: 'Jobs', to: 'Engineer' }, { from: 'Mayor', to: 'Jobs' }];
  assert.deepEqual(pairUp(['Engineer', 'Jobs', 'Mayor', 'Music'], exchanges), [['Mayor', 'Music'], ['Engineer', 'Jobs']]);
  assert.deepEqual(pairUp(['Jobs', 'Money'], exchanges), [], 'no tie, no pair');
});
