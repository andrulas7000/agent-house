import test from 'node:test';
import assert from 'node:assert/strict';
import { bubbleOf, jobOf, moodOf, newsOf, routineOf, stateOf, wordsFor } from './news.js';

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
  assert.equal(stateOf(study, {}, false, at(10)), 'work');
  assert.equal(stateOf(study, {}, false, at(12)), 'eat');
  assert.equal(stateOf(study, {}, false, at(18)), 'social');
  assert.equal(stateOf(study, {}, false, at(21)), 'stroll');
  assert.equal(stateOf(study, { busy: true }, false, at(2)), 'working');
  assert.equal(stateOf(study, {}, true, at(2)), 'meeting');
  assert.equal(stateOf(agent({ lastVisit: null }), {}, false, at(10)), 'work', 'newcomers join in');
});

test('residents start and stop at slightly different times', () => {
  const names = ['Mayor', 'Tutoring', 'Study', 'Music', 'Engineer'];
  const splitsUp = Array.from({ length: 31 }, (_, minute) => new Set(names.map((name) => routineOf(name, new Date(2026, 10, 9, 12, minute)))).size);
  assert.ok(splitsUp.includes(2), 'some leave for lunch before others');
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
