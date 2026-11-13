import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { islandView, laneOut } from './src/layout.js';
import { spawnSync } from 'node:child_process';
import { titleOf, withChats } from './lib.js';
import { NEWS_HOSTS, NEWS_SOURCES, addJobs, allowedSource, changeJob, jobsMarkdown, mergeNews, newsDue, parseJobs, parseNews } from './lib.js';

test('the old single conversation becomes the first chat, keeping its messages and memory', () => {
  const messages = [{ role: 'user', text: 'hi', at: 5 }, { role: 'agent', text: 'yo', at: 9 }];
  const { chats, days } = withChats({ messages, sessionId: 's1', days: ['d'] });
  assert.deepEqual(chats, [{ id: '5', title: 'Earlier conversation', messages, sessionId: 's1', at: 9 }]);
  assert.deepEqual(days, ['d']);
  assert.deepEqual(withChats({ messages: [] }).chats, [], 'nothing said, nothing to list');
  const migrated = withChats({ chats: [{ id: 'a' }] });
  assert.deepEqual(withChats(migrated), migrated, 'already moved stays put');
});

test('a chat is titled by its first line, or its first file', () => {
  assert.equal(titleOf('  plan the week\nand more'), 'plan the week');
  assert.equal(titleOf('', ['C:\\notes\\exam.pdf']), 'exam.pdf');
  assert.equal(titleOf(''), 'New conversation');
});

import { writeFileSync } from 'node:fs';
import { OWNER, applyOp, callsOf, growthOf, logExchange, googleArgs, googleCalls, settleGoogleSync, startGoogleSync, countMisses, eventsFrom, houseBrief, levelOf, listFolders, meetingDue, parseOps, parseToday, pathsIn, streak, tierOf, webOf, weekOf } from './lib.js';

const emptyHouse = (tiers = {}) => ({ events: [], goals: [], tiers, inbox: {}, nextId: 1, meeting: { auto: true } });
const slot = (title, time = '16:00') => ({ do: 'add', title, day: '2026-11-10', time, minutes: 60 });

test('the island camera covers the window and never overshoots it by a whole art pixel', () => {
  for (const dpr of [1, 1.125, 1.25, 1.5, 1.75, 2, 3]) {
    for (const [vw, vh] of [[1536, 730], [1537, 731], [1535, 729], [1920, 953], [2560, 1300]]) {
      const v = islandView(vw, vh, 331, dpr);
      assert.ok(Number.isInteger(v.dev), `${vw}x${vh} @${dpr} scale ${v.dev}`);
      assert.ok(v.LW * v.s >= vw - 1e-6 && v.LH * v.s >= vh - 1e-6, `${vw}x${vh} @${dpr} leaves a gap`);
      if (!v.pans) assert.ok(v.LW * v.s - vw < v.s && v.LH * v.s - vh < v.s, `${vw}x${vh} @${dpr} overshoots`);
    }
  }
});

test('Claude levels: Sonnet by default, known models only, owner only', () => {
  const house = emptyHouse();
  const agents = ['Engineer', 'God', 'Mayor'];
  const set = (actor, agent, model) => applyOp(house, actor, { do: 'model', agent, model }, { agents }).ok;
  assert.equal(levelOf(house, 'Engineer'), 'claude-opus-5-5', 'Engineer starts on Opus');
  assert.equal(levelOf(house, 'God'), 'claude-sonnet-5-5');
  assert.ok(set(OWNER, 'Engineer', 'claude-opus-5-5'));
  assert.equal(levelOf(house, 'Engineer'), 'claude-opus-5-5');
  assert.equal(levelOf(house, 'Mayor'), 'claude-sonnet-5-5', 'one resident at a time');
  for (const actor of ['God', 'Mayor', 'Engineer']) assert.equal(set(actor, 'Engineer', 'claude-fable-5-1'), false, `${actor} can't change it`);
  assert.equal(set(OWNER, 'Engineer', '--dangerously-skip-permissions'), false);
  assert.equal(set(OWNER, 'Nobody', 'claude-opus-5-5'), false);
  assert.equal(levelOf(house, 'Engineer'), 'claude-opus-5-5', 'refused changes leave it alone');
  assert.equal(levelOf({ models: { Mayor: '--bad' } }, 'Mayor'), 'claude-sonnet-5-5', 'a bad saved value falls back');
  assert.ok(set(OWNER, 'Engineer', 'claude-sonnet-5-5'));
  assert.equal(levelOf(house, 'Engineer'), 'claude-sonnet-5-5', 'the owner can still move Engineer down');
});

test('internet is per resident, on by default, and only the owner can change it', () => {
  const house = emptyHouse();
  const agents = ['Music', 'God', 'Mayor'];
  const set = (actor, on) => applyOp(house, actor, { do: 'web', agent: 'Music', on }, { agents }).ok;
  assert.equal(webOf(house, 'Music'), true);
  assert.ok(set(OWNER, false));
  assert.equal(webOf(house, 'Music'), false);
  assert.equal(webOf(house, 'Mayor'), true, 'one resident at a time');
  for (const actor of ['God', 'Mayor', 'Music']) assert.equal(set(actor, true), false, `${actor} can't change it`);
  assert.equal(webOf(house, 'Music'), false);
});

test('paths in a message: spaces, quotes, punctuation, and only what exists', () => {
  const real = new Set(['C:\\My Docs\\report final.pdf', 'C:\\a.txt', 'D:/x/y.png']);
  const exists = (p) => real.has(p);
  assert.deepEqual(pathsIn('mira C:\\My Docs\\report final.pdf y dime', exists), ['C:\\My Docs\\report final.pdf']);
  assert.deepEqual(pathsIn('"C:\\My Docs\\report final.pdf"', exists), ['C:\\My Docs\\report final.pdf']);
  assert.deepEqual(pathsIn('uno C:\\a.txt, otro D:/x/y.png.', exists), ['C:\\a.txt', 'D:/x/y.png']);
  assert.deepEqual(pathsIn('nada en C:\\nope.txt ni en ratio 3:1', exists), []);
  assert.deepEqual(pathsIn('C:\\a.txt\nC:\\a.txt', exists), ['C:\\a.txt'], 'once each');
});

test('the file guard allows own folders and exact attachments, and fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fguard-'));
  const own = join(dir, 'agent');
  const attached = join(dir, 'Desk Top', 'Report.pdf');
  const env = { ...process.env, AGENT_HOUSE_ROOTS: JSON.stringify([own]), AGENT_HOUSE_FILES: JSON.stringify([attached]) };
  const guard = (tool, input, e = env) => spawnSync(process.execPath, ['file-guard.cjs'], { input: JSON.stringify({ tool_name: tool, tool_input: input, cwd: own }), env: e }).status;
  assert.equal(guard('Read', { file_path: attached }), 0);
  assert.equal(guard('Read', { file_path: attached.toUpperCase() }), 0, 'Windows paths ignore case');
  assert.equal(guard('Edit', { file_path: attached }), 0);
  assert.equal(guard('Read', { file_path: 'notes.md' }), 0, 'its own folder');
  assert.equal(guard('Glob', { pattern: '**/*.md' }), 0);
  assert.equal(guard('Read', { file_path: join(dir, 'Desk Top', 'other.pdf') }), 2, 'not what sits next to it');
  assert.equal(guard('Write', { file_path: join(dir, 'Desk Top', 'new.txt') }), 2);
  assert.equal(guard('Glob', { path: join(dir, 'Desk Top'), pattern: '*' }), 2);
  assert.equal(guard('Glob', { pattern: '../Desk Top/*' }), 2, 'no walking out');
  assert.equal(guard('Read', { file_path: '../secret.txt' }), 2);
  assert.equal(guard('Read', { file_path: attached }, { ...process.env }), 2, 'no list means no access');
});

test('residents talk only in the owner’s own chat, never to God or themselves', () => {
  const agents = ['Study', 'Music', 'God'];
  const talk = (actor, agent, text, canTalk = true) => applyOp(emptyHouse(), actor, { do: 'talk', agent, text }, { agents, canTalk });
  assert.deepEqual(talk('Study', 'Music', ' hi  there ').talk, { agent: 'Music', text: 'hi there' });
  assert.equal(talk('Study', 'Music', 'hi', false).ok, false, 'not in a meeting or inside another talk');
  assert.equal(talk('Study', 'God', 'hi').ok, false);
  assert.equal(talk('Study', 'Study', 'hi').ok, false);
  assert.equal(talk('Study', 'Nobody', 'hi').ok, false);
  assert.equal(talk('Study', 'Music', '   ').ok, false);
  assert.match(houseBrief(emptyHouse(), 'Study', agents, [], undefined, { canTalk: true }), /"do":"talk"/);
  assert.doesNotMatch(houseBrief(emptyHouse(), 'Study', agents), /"do":"talk"/);
});

test('Google sync: existing blocks wait, changes copy, bumps and removals clean up', () => {
  const agents = ['Study'];
  const tz = 'America/Toronto';
  const house = emptyHouse();
  const add = (title, day, time, minutes = 60) => applyOp(house, OWNER, { do: 'add', title, day, time, minutes }, { agents });
  add('Old class', '2026-11-10', '10:00');
  startGoogleSync(house, 1);
  house.google.calendar = 'cal-1';
  assert.deepEqual(googleCalls(house, tz), [], 'what was already there stays out');

  add('New block', '2026-11-11', '23:30', 60);
  const [create] = googleCalls(house, tz);
  assert.equal(create.tool, 'create_event');
  assert.deepEqual(create.args, { calendarId: 'cal-1', summary: 'New block', timeZone: tz, startTime: '2026-11-11T23:30:00', endTime: '2026-11-12T00:30:00' });
  settleGoogleSync(house, [{ call: create, googleId: 'g1' }]);
  assert.deepEqual(googleCalls(house, tz), [], 'a settled change is done');

  applyOp(house, OWNER, { do: 'move', id: create.event, time: '09:00' }, { agents });
  const [update] = googleCalls(house, tz);
  assert.equal(update.tool, 'update_event');
  assert.equal(update.args.eventId, 'g1');
  settleGoogleSync(house, [{ call: update }]);

  house.events.find((e) => e.id === create.event).bumped = 'Mayor';
  const [gone] = googleCalls(house, tz);
  assert.deepEqual([gone.tool, gone.args], ['delete_event', { calendarId: 'cal-1', eventId: 'g1' }]);
  settleGoogleSync(house, [{ call: gone }]);
  assert.deepEqual(googleCalls(house, tz), [], 'a bumped block stays away');

  const old = house.events.find((e) => e.title === 'Old class');
  applyOp(house, OWNER, { do: 'move', id: old.id, time: '11:00' }, { agents });
  assert.equal(googleCalls(house, tz)[0].tool, 'create_event', 'an old block copies once someone moves it');
  settleGoogleSync(house, [{ call: googleCalls(house, tz).find((c) => c.event === old.id), googleId: 'g2' }]);
  applyOp(house, OWNER, { do: 'remove', id: old.id }, { agents });
  assert.deepEqual(googleCalls(house, tz).find((c) => c.gone === 'g2').args, { calendarId: 'cal-1', eventId: 'g2' });
  assert.deepEqual(googleArgs({ title: 'Trip', day: '2026-12-31', time: '', minutes: 60 }, 'c', tz), { calendarId: 'c', summary: 'Trip', timeZone: tz, allDay: true, startTime: '2026-12-31T00:00:00', endTime: '2027-01-01T00:00:00' });
});

test('the calendar guard allows only the exact planned calls, and fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  const plan = join(dir, 'plan.json');
  const args = { calendarId: 'cal-1', summary: 'Study', startTime: 'a', endTime: 'b', timeZone: 'z' };
  writeFileSync(plan, JSON.stringify([{ tool: 'create_event', args }]));
  const guard = (input, env = plan, tool = 'mcp__x__create_event') => spawnSync(process.execPath, ['calendar-guard.cjs'], { input: JSON.stringify({ tool_name: tool, tool_input: input }), env: { ...process.env, AGENT_HOUSE_PLANNED: env } }).status;
  assert.equal(guard({ ...args }), 0);
  assert.equal(guard({ timeZone: 'z', endTime: 'b', startTime: 'a', summary: 'Study', calendarId: 'cal-1' }), 0, 'key order does not matter');
  assert.equal(guard({ ...args, attendees: [{ email: 'x@y.z' }] }), 2, 'no inviting anyone');
  assert.equal(guard({ ...args, calendarId: 'primary' }), 2, 'no other calendar');
  assert.equal(guard({ ...args, summary: 'Changed' }), 2);
  assert.equal(guard({ calendarId: 'cal-1', eventId: 'real' }, plan, 'mcp__x__delete_event'), 2, 'no unplanned deletes');
  assert.equal(guard({ ...args }, join(dir, 'missing.json')), 2, 'no plan means no writes');
});

test('access levels: defaults, God and the owner', () => {
  const house = emptyHouse({ Music: 'read' });
  assert.equal(tierOf(house, 'Mayor'), 'mayor');
  assert.equal(tierOf({ tiers: { Mayor: 'read' } }, 'Mayor'), 'mayor', 'nobody can demote Mayor');
  assert.equal(tierOf(house, 'Studio'), 'member');
  assert.equal(tierOf(house, 'Music'), 'read');
  assert.equal(tierOf(house, 'god'), 'god');
  assert.equal(tierOf(house, OWNER), 'owner');
});

test('calendar: lower levels are refused, higher levels bump', () => {
  const house = emptyHouse();
  assert.ok(applyOp(house, 'Mayor', slot('Exam prep')).ok);
  const refused = applyOp(house, 'Studio', slot('Session', '16:30'));
  assert.equal(refused.ok, false);
  assert.match(refused.message, /Exam prep/);

  assert.ok(applyOp(house, 'Studio', slot('Mix', '09:00')).ok);
  const bump = applyOp(house, 'Mayor', slot('Standup', '09:30'));
  assert.ok(bump.ok);
  assert.match(bump.message, /Bumped "Mix"/);
  assert.equal(house.events.find((e) => e.title === 'Mix').bumped, 'Mayor');
  assert.ok(applyOp(house, 'Studio', slot('Mix again', '09:00')).ok === false, 'the slot now belongs to Mayor');
});

test('calendar: untimed and non-overlapping events never clash', () => {
  const house = emptyHouse();
  assert.ok(applyOp(house, 'Mayor', slot('A', '10:00')).ok);
  assert.ok(applyOp(house, 'Studio', slot('Back to back', '11:00')).ok);
  assert.ok(applyOp(house, 'Studio', { do: 'add', title: 'All day', day: '2026-11-10' }).ok);
});

test('calendar: read-only residents and invalid input are refused', () => {
  const house = emptyHouse({ Music: 'read' });
  assert.equal(applyOp(house, 'Music', slot('Nope')).ok, false);
  for (const bad of [{ day: '2026-02-31' }, { day: 'soon' }, { time: '25:00' }, { minutes: 0 }, { title: '   ' }]) {
    assert.equal(applyOp(house, 'Mayor', { ...slot('X'), ...bad }).ok, false, JSON.stringify(bad));
  }
  assert.equal(house.events.length, 0);
});

test('removal needs ownership or a higher level', () => {
  const house = emptyHouse();
  applyOp(house, 'Mayor', slot('Held'));
  const id = house.events[0].id;
  assert.equal(applyOp(house, 'Studio', { do: 'remove', id }).ok, false);
  assert.equal(applyOp(house, 'Assistant', { do: 'remove', id }).ok, false);
  assert.ok(applyOp(house, 'God', { do: 'remove', id }).ok);
  assert.equal(house.events.length, 0);
});

test('move: Mayor can re-place anyone\'s block, others only their own', () => {
  const house = emptyHouse();
  applyOp(house, OWNER, slot('Gym', '08:00'));
  const id = house.events[0].id;
  assert.equal(applyOp(house, 'Study', { do: 'move', id, time: '09:00' }).ok, false);
  assert.ok(applyOp(house, 'Mayor', { do: 'move', id, day: '2026-11-11', time: '09:00', minutes: 30 }).ok);
  assert.deepEqual(
    { day: house.events[0].day, time: house.events[0].time, minutes: house.events[0].minutes, title: house.events[0].title, by: house.events[0].by },
    { day: '2026-11-11', time: '09:00', minutes: 30, title: 'Gym', by: OWNER },
    'fields left out stay as they were, and the block stays the owner\'s',
  );
  assert.ok(applyOp(house, 'Mayor', { do: 'remove', id }).ok);
});

test('move: follows the same clash rules as booking, and un-bumps', () => {
  const house = emptyHouse();
  applyOp(house, OWNER, slot('Held', '10:00'));
  applyOp(house, 'Study', slot('Revision', '12:00'));
  applyOp(house, 'Mayor', slot('Standup', '14:00'));
  const [held, revision, standup] = house.events;

  const refused = applyOp(house, 'Mayor', { do: 'move', id: standup.id, time: '10:30' });
  assert.equal(refused.ok, false, 'the owner\'s slot has to be cleared first');
  assert.equal(standup.time, '14:00');

  assert.match(applyOp(house, 'Mayor', { do: 'move', id: standup.id, time: '12:30' }).message, /Bumped "Revision"/);
  assert.equal(revision.bumped, 'Mayor');
  assert.ok(applyOp(house, 'Mayor', { do: 'move', id: revision.id, time: '16:00' }).ok);
  assert.equal(revision.bumped, undefined);

  assert.ok(applyOp(house, 'Mayor', { do: 'move', id: held.id, time: '18:00' }).ok);
  assert.ok(applyOp(house, 'Mayor', { do: 'move', id: standup.id, time: '10:30' }).ok, 'free once the owner\'s block moved');
  for (const bad of [{ day: 'soon' }, { time: '25:00' }, { minutes: 0 }, { title: ' ' }]) {
    assert.equal(applyOp(house, 'Mayor', { do: 'move', id: standup.id, ...bad }).ok, false, JSON.stringify(bad));
  }
  assert.equal(applyOp(house, 'Mayor', { do: 'move', id: 999, time: '10:30' }).ok, false);
});

test('tell: Mayor is the funnel', () => {
  const house = emptyHouse({ Music: 'read' });
  const agents = ['God', 'Mayor', 'Music', 'Study', 'Tutoring'];
  const tell = (from, to) => applyOp(house, from, { do: 'tell', agent: to, text: `${from} to ${to}` }, { agents });

  assert.ok(tell('Mayor', 'Tutoring').ok);
  assert.ok(tell('Mayor', 'Music').ok, 'a read-only resident can still be briefed');
  assert.ok(tell('Study', 'Mayor').ok);
  assert.equal(tell('Study', 'Tutoring').ok, false, 'residents go through Mayor');
  assert.equal(tell('Music', 'Mayor').ok, false, 'read-only residents can\'t write');
  assert.equal(tell('Mayor', 'God').ok, false);
  assert.equal(tell('Mayor', 'Ghost').ok, false);
  assert.deepEqual(house.inbox.Tutoring.map((m) => [m.from, m.text]), [['Mayor', 'Mayor to Tutoring']]);

  for (let i = 0; i < 29; i++) assert.ok(tell('Mayor', 'Tutoring').ok);
  assert.equal(tell('Mayor', 'Tutoring').ok, false, 'a full inbox refuses rather than dropping notes');
  assert.equal(house.inbox.Tutoring.length, 30);
});

test('tell: in a chat with the owner it becomes a talk, not a note left waiting', () => {
  const house = emptyHouse();
  const agents = ['Mayor', 'Tutoring'];
  const result = applyOp(house, 'Mayor', { do: 'tell', agent: 'Tutoring', text: 'Session Thursday' }, { agents, canTalk: true });
  assert.deepEqual(result.talk, { agent: 'Tutoring', text: 'Session Thursday' });
  assert.equal(house.inbox.Tutoring, undefined, 'nothing waits: it is talked through');
  assert.equal(applyOp(house, 'Mayor', { do: 'tell', agent: 'Mayor', text: 'hi' }, { agents, canTalk: true }).ok, false, 'no notes to yourself');
});

test('houseBrief hands over waiting notes and shows each side how to send them', () => {
  const house = emptyHouse();
  const agents = ['Mayor', 'Tutoring'];
  applyOp(house, 'Mayor', { do: 'tell', agent: 'Tutoring', text: 'Session Thursday' }, { agents });
  applyOp(house, 'Tutoring', { do: 'tell', agent: 'Mayor', text: 'Plan is ready' }, { agents });
  const toTutor = houseBrief(house, 'Tutoring', agents);
  assert.match(toTutor, /Briefs from Mayor[\s\S]*Session Thursday/);
  assert.match(toTutor, /"agent":"Mayor"/);
  const toManager = houseBrief(house, 'Mayor', agents);
  assert.match(toManager, /Reports from residents[\s\S]*Plan is ready/);
  assert.match(toManager, /"do":"move"/);
  assert.doesNotMatch(houseBrief(emptyHouse(), 'Tutoring', agents), /Briefs from Mayor/);
});

test('laneOut puts only overlapping blocks side by side', () => {
  const at = (id, time, minutes) => ({ id, time, minutes });
  const lanes = laneOut([at(1, '09:00', 60), at(2, '09:30', 60), at(3, '10:00', 60), at(4, '12:00', 30)]);
  assert.deepEqual(lanes.get(1), { lane: 0, lanes: 2 });
  assert.deepEqual(lanes.get(2), { lane: 1, lanes: 2 });
  assert.deepEqual(lanes.get(3), { lane: 0, lanes: 2 });
  assert.deepEqual(lanes.get(4), { lane: 0, lanes: 1 });
});

test('weekly goals: anyone with write access can tick, only the setter or higher can drop', () => {
  const house = emptyHouse({ Music: 'read' });
  applyOp(house, OWNER, { do: 'goal', text: 'Ship the bridge' });
  const id = house.goals[0].id;
  assert.equal(applyOp(house, 'Music', { do: 'check', id }).ok, false);
  assert.ok(applyOp(house, 'Studio', { do: 'check', id }).ok);
  assert.equal(house.goals[0].done, true);
  assert.equal(applyOp(house, 'Mayor', { do: 'drop', id }).ok, false);
  assert.ok(applyOp(house, OWNER, { do: 'drop', id }).ok);
});

test('only God and the owner change access, and God cannot be demoted', () => {
  const house = emptyHouse();
  const agents = ['God', 'Mayor', 'Music'];
  assert.equal(applyOp(house, 'Mayor', { do: 'tier', agent: 'Music', level: 'priority' }, { agents }).ok, false);
  assert.ok(applyOp(house, 'God', { do: 'tier', agent: 'Music', level: 'priority' }, { agents }).ok);
  assert.equal(tierOf(house, 'Music'), 'priority');
  assert.equal(applyOp(house, OWNER, { do: 'tier', agent: 'God', level: 'read' }, { agents }).ok, false);
  assert.equal(applyOp(house, OWNER, { do: 'tier', agent: 'Ghost', level: 'read' }, { agents }).ok, false);
  assert.equal(applyOp(house, 'Mayor', { do: 'auto', on: false }).ok, false);
});

test('parseOps strips the block and survives bad lines', () => {
  const { clean, ops } = parseOps('Booked it.\n<house>\n{"do":"goal","text":"a"}\nnot json\n</house>');
  assert.equal(clean, 'Booked it.');
  assert.deepEqual(ops, [{ do: 'goal', text: 'a' }, { do: 'unreadable' }]);
  assert.equal(applyOp(emptyHouse(), 'Studio', ops[1]).ok, false);
  assert.equal(applyOp(emptyHouse(), 'Studio', null).ok, false);
  assert.deepEqual(parseOps('plain reply'), { clean: 'plain reply', ops: [] });
});

test('houseBrief shows each level only what it can do', () => {
  const house = emptyHouse({ Music: 'read' });
  const agents = ['God', 'Mayor', 'Music'];
  assert.match(houseBrief(house, 'God', agents), /"do":"tier"/);
  assert.doesNotMatch(houseBrief(house, 'Mayor', agents), /"do":"tier"/);
  assert.match(houseBrief(house, 'Music', agents), /read-only/);
  assert.doesNotMatch(houseBrief(house, 'Music', agents), /<house>/);
});

test('weekOf starts on Monday and honours the 04:00 rollover', () => {
  assert.equal(weekOf(new Date(2026, 10, 9, 12).getTime()), '2026-11-09');
  assert.equal(weekOf(new Date(2026, 10, 15, 23).getTime()), '2026-11-09');
  assert.equal(weekOf(new Date(2026, 10, 9, 2).getTime()), '2026-11-02');
});

test('meetingDue fires once after the Sunday 18:00 slot', () => {
  const sunday = (h) => new Date(2026, 10, 15, h).getTime();
  const monday = new Date(2026, 10, 16, 9).getTime();
  assert.equal(meetingDue(sunday(12) - 864e5, sunday(12)), false);
  assert.equal(meetingDue(sunday(12), sunday(19)), true);
  assert.equal(meetingDue(sunday(19), monday), false);
  assert.equal(meetingDue(sunday(12), monday), true, 'catches up if the house was closed on Sunday');
});

test('only real folders become residents', () => {
  const root = mkdtempSync(join(tmpdir(), 'house-'));
  for (const d of ['mayor', '_app', '.git', 'node_modules', 'band mate']) mkdirSync(join(root, d));
  assert.deepEqual(listFolders(root), ['band mate', 'mayor']);
});

test('streak counts back from today, or yesterday, and stops at a gap', () => {
  const days = ['2026-11-05', '2026-11-07', '2026-11-08'];
  assert.equal(streak(days, '2026-11-08'), 2);
  assert.equal(streak(days, '2026-11-09'), 2);
  assert.equal(streak(days, '2026-11-10'), 0);
  assert.equal(streak(['2026-02-28', '2026-03-01'], '2026-03-01'), 2);
});

test('parseToday reads commitments in the mayor format', () => {
  const md = `## This week
Capacity: 40

## Today (2026-11-08)
| Commitment | Minutes | When | Proof | Result |
|---|---|---|---|---|
| Problems 1-12 | 90 | 16:00 | photo | done |
| Bridge on track two | 60 | 20:00 | bounce | missed |
| Read chapter 3 | 30 | 21:00 | notes | partial |
| Email TA | 10 | 22:00 | sent | |
Sleep: 7 | Energy: 4
`;
  const today = parseToday(md);
  assert.equal(today.date, '2026-11-08');
  assert.deepEqual(today.items.map((i) => i.status), ['done', 'missed', 'partial', 'open']);
  assert.equal(today.items[0].text, 'Problems 1-12');
  assert.equal(today.items[0].when, '16:00');
});

test('parseToday handles a missing section', () => {
  assert.equal(parseToday('# State\n'), null);
});

test('countMisses only counts MISS lines inside the window', () => {
  const ledger = [
    '2026-11-08 | MISS | a | cause: overloaded',
    '2026-11-02 | MISS | b | cause: blocked',
    '2026-11-01 | MISS | c | cause: blocked',
    '2026-11-08 | DONE | d | est 10 / actual 12',
  ].join('\n');
  assert.equal(countMisses(ledger, '2026-11-08'), 2);
});

test('eventsFrom maps the claude stream', () => {
  assert.deepEqual(eventsFrom('{"type":"system","subtype":"init","session_id":"abc"}'), [{ type: 'session', id: 'abc' }]);
  assert.deepEqual(
    eventsFrom(JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'text', text: 'Hi' },
      { type: 'tool_use', name: 'Write', input: { file_path: 'C:\\x\\STATE.md'.replaceAll('\\', '/') } },
    ] } })),
    [{ type: 'text', text: 'Hi' }, { type: 'activity', label: 'Writing STATE.md' }],
  );
  assert.deepEqual(eventsFrom('not json'), []);
  assert.deepEqual(
    eventsFrom(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__claude_ai_Google_Calendar__list_events', input: {} }] } })),
    [{ type: 'activity', label: 'Checking your calendar' }],
  );
});

test('only listed outlets reach the paper, and look-alike domains do not get in', () => {
  const host = NEWS_HOSTS[0];
  for (const url of ['https://www.semana.com/politica/x', 'https://www.cnews.fr/france/x', `https://${host}.fake.net/x`, `https://not${host}/x`, `ftp://${host}/x`, 'javascript:alert(1)', 'nonsense', undefined, `https://www.${host}/`]) {
    assert.equal(allowedSource(url), false, String(url));
  }
  for (const url of [`https://www.${host}/x`, `https://news.${host}/x`]) assert.equal(allowedSource(url), true, url);
  assert.ok(!NEWS_HOSTS.some((d) => /semana|cnews|valeursactuelles|rebelnews|breitbart/.test(d)));
});

test('the reporter only files what can be shown', () => {
  const [first, second] = Object.keys(NEWS_SOURCES);
  const host = NEWS_SOURCES[first][0];
  const story = (over) => ({ topic: first, title: 'Titular', summary: 'Resumen', source: 'Medio', url: `https://www.${host}/a`, ...over });
  const reply = JSON.stringify({ items: [story(), story(), story({ url: 'https://www.semana.com/b' }), story({ url: `https://www.${host}/c`, topic: 'Marte' }), story({ url: `https://www.${host}/d`, title: '  ' }), null] });
  assert.deepEqual(parseNews(`Here you go:\n${reply}`).map((n) => n.url), [`https://www.${host}/a`], 'one story, once');
  assert.deepEqual(parseNews(reply, [`https://www.${host}/a`]), [], 'nothing it already had');
  assert.equal(parseNews('sorry, no json'), null);
  assert.equal(parseNews('{"items": 3}'), null);
  const merged = mergeNews([story({ topic: second })], [story({ topic: first })]);
  assert.deepEqual(merged.map((n) => n.topic), [first, second], 'sections keep their order');
});

test('one edition each morning, and a failed trip waits', () => {
  const at = (h) => new Date(2026, 10, 10, h, 0).getTime();
  assert.equal(newsDue({ day: '2026-11-09' }, at(5)), false, 'too early');
  assert.equal(newsDue({ day: '2026-11-09' }, at(8)), true);
  assert.equal(newsDue({ day: '2026-11-10' }, at(8)), false, 'already out');
  assert.equal(newsDue({ day: null }, at(8)), true, 'a brand new island');
  assert.equal(newsDue({ day: '2026-11-09', retryAt: at(9) }, at(8)), false);
  assert.equal(newsDue({ day: '2026-11-09', retryAt: at(9) }, at(10)), true);
});

test('the news guard only opens the listed outlets', () => {
  const env = { ...process.env, AGENT_HOUSE_NEWS_SOURCES: JSON.stringify(['lemonde.fr', 'cbc.ca']) };
  const guard = (tool, input, e = env) => spawnSync(process.execPath, ['news-guard.cjs'], { input: JSON.stringify({ tool_name: tool, tool_input: input }), env: e }).status;
  assert.equal(guard('WebFetch', { url: 'https://www.lemonde.fr/x' }), 0);
  assert.equal(guard('WebFetch', { url: 'https://www.cnews.fr/x' }), 2);
  assert.equal(guard('WebFetch', { url: 'not a url' }), 2);
  assert.equal(guard('WebSearch', { query: 'x', allowed_domains: ['lemonde.fr', 'www.cbc.ca'] }), 0);
  assert.equal(guard('WebSearch', { query: 'x', allowed_domains: ['lemonde.fr', 'semana.com'] }), 2);
  assert.equal(guard('WebSearch', { query: 'x' }), 2, 'an unrestricted search');
  assert.equal(guard('WebFetch', { url: 'https://www.lemonde.fr/x' }, { ...process.env }), 2, 'no list means no access');
});

test('Jobs only pins real openings, and what the owner removed stays removed', () => {
  const opening = (over) => ({ title: 'Internship', company: 'Acme', location: 'Remote', summary: 'Something', url: 'https://acme.com/jobs/1', ...over });
  const reply = JSON.stringify({ items: [opening(), opening(), opening({ url: 'https://acme.com/' }), opening({ url: 'javascript:alert(1)' }), opening({ title: ' ', url: 'https://acme.com/jobs/2' }), null] });
  const found = parseJobs(reply);
  assert.deepEqual(found.map((j) => [j.url, j.status]), [['https://acme.com/jobs/1', 'new']]);
  assert.equal(parseJobs('not json'), null);

  const board = addJobs({ items: [], gone: [], error: 'old' }, found);
  assert.equal(board.error, '');
  assert.equal(changeJob(board, { action: 'status', url: 'https://acme.com/jobs/1', status: 'applied' }), null);
  assert.match(jobsMarkdown(board.items), /\[applied\] Internship, Acme \(Remote\)/);
  assert.ok(changeJob(board, { action: 'status', url: 'https://acme.com/jobs/1', status: 'hacked' }));
  assert.ok(changeJob(board, { action: 'remove', url: 'https://nope.com/x' }));
  assert.equal(changeJob(board, { action: 'remove', url: 'https://acme.com/jobs/1' }), null);
  assert.deepEqual(board.items, []);
  assert.deepEqual(parseJobs(reply, board.gone), [], 'a removed opening does not come back');
});

test('the plan counts as used up only when a window is full, and wakes at the latest reset', async () => {
  const { limitUntil, eventsFrom } = await import('./lib.js');
  const ok = { status: 'allowed', resetsAt: 100, unifiedWindows: { five_hour: { utilization: 0.4, resetsAt: 100, status: 'allowed' }, seven_day: { utilization: 0.9, resetsAt: 900, status: 'allowed' } } };
  assert.equal(limitUntil(ok), 0);
  assert.equal(limitUntil({ ...ok, isUsingOverage: true, unifiedWindows: { ...ok.unifiedWindows, five_hour: { utilization: 1, resetsAt: 100, status: 'allowed' } } }), 100_000, 'overage still means 100%');
  assert.equal(limitUntil({ status: 'rejected', resetsAt: 300 }), 300_000);
  assert.equal(limitUntil({ status: 'rejected', resetsAt: 300, unifiedWindows: { seven_day: { utilization: 1, resetsAt: 900 } } }), 900_000);
  assert.deepEqual(eventsFrom(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: ok })), [{ type: 'limit', until: 0 }]);
});

test('a resident calls the owner only for a block with them or something urgent', () => {
  const agents = ['Study', 'Music'];
  const at = (hhmm) => new Date(`2026-11-11T${hhmm}:00`).getTime();
  const house = emptyHouse();
  const add = (actor, op) => applyOp(house, actor, { do: 'add', title: 'Review the thesis', day: '2026-11-11', time: '10:00', minutes: 30, ...op }, { agents });

  assert.equal(add('Study', { owner: true }).ok, true);
  assert.equal(add('Music', { owner: true, time: '12:00' }).ok, true);
  assert.equal(add(OWNER, { owner: true, title: 'My block', time: '14:00' }).ok, true);
  assert.equal(house.events.find((e) => e.by === OWNER).owner, undefined, 'the owner does not call themselves');
  assert.deepEqual(callsOf(house, at('09:59')), [], 'nothing rings before the block starts');

  const ringing = callsOf(house, at('10:10'));
  assert.deepEqual(ringing.map((c) => [c.agent, c.kind, c.status]), [['Study', 'block', 'ringing']]);
  assert.equal(callsOf(house, at('10:31'))[0].status, 'missed', 'unanswered, it becomes a missed call');
  assert.equal(callsOf(house, at('10:31') + 4 * 864e5).length, 0, 'a missed call is forgotten after a few days');

  house.events[0].answered = at('10:11');
  assert.deepEqual(callsOf(house, at('10:12')), [], 'answered is answered');
  applyOp(house, 'Study', { do: 'move', id: house.events[0].id, time: '11:00' }, { agents });
  assert.equal(house.events[0].answered, undefined, 'a new slot rings again');
  assert.equal(house.events[0].owner, true, 'and still wants the owner');
  applyOp(house, 'Music', { do: 'move', id: house.events[0].id, title: 'Another title' }, { agents });
  assert.equal(applyOp(house, OWNER, { do: 'move', id: house.events[0].id, owner: false }, { agents }).ok, true);
  assert.equal(house.events[0].owner, true, 'only its holder decides whether it rings');

  const urgent = (actor, withOwner = false, now = at('15:00')) => applyOp(house, actor, { do: 'call', why: ' Needs  your signature ' }, { agents, withOwner, now });
  assert.equal(urgent('Music', true).ok, false, 'no ringing while the owner is already in the chat');
  assert.equal(urgent('Music').ok, true);
  assert.equal(urgent('Music').ok, false, 'one unanswered call at a time');
  assert.equal(applyOp(house, 'Study', { do: 'call', why: '  ' }, { agents }).ok, false, 'a call says why');
  assert.equal(applyOp(emptyHouse({ Study: 'read' }), 'Study', { do: 'call', why: 'x' }, { agents }).ok, false, 'read-only residents cannot call');
  const call = callsOf(house, at('15:05')).find((c) => c.agent === 'Music');
  assert.deepEqual([call.kind, call.why, call.status], ['urgent', 'Needs your signature', 'ringing']);
  assert.equal(callsOf(house, at('15:31')).find((c) => c.agent === 'Music').status, 'missed');

  assert.match(houseBrief(emptyHouse(), 'Study', agents), /"do":"call"/);
  assert.doesNotMatch(houseBrief(emptyHouse(), 'Study', agents, [], undefined, { withOwner: true }), /"do":"call"/, 'the owner is right there');
});

test('levels come from days talked and goals done, and each level earns one gift to unwrap', () => {
  const goals = [{ by: 'Music', done: true }, { by: 'Music', done: false }, { by: 'Study', done: true }];
  const start = growthOf({ days: ['a', 'b'] }, goals, 'Music');
  assert.deepEqual([start.points, start.level, start.nextAt, start.unwrapped], [5, 2, 7, 1], '2 days and 1 goal of its own');
  assert.equal(new Set(start.offer).size, 3, 'three different gifts to pick from');
  assert.deepEqual(growthOf({ days: ['a', 'b'], gifts: [{ id: start.offer[0] }] }, goals, 'Music').offer, [], 'unwrapped is unwrapped');
  const second = growthOf({ days: Array(7).fill('d'), gifts: [{ id: 'plant' }] }, [], 'Music');
  assert.equal(second.unwrapped, 1);
  assert.equal(second.offer.includes('plant'), false, 'never offers one it already has');
  assert.equal(growthOf({ days: [] }, [], 'Music').level, 1);
  const veteran = growthOf({ days: Array(200).fill('d') }, [], 'Music');
  assert.deepEqual([veteran.level > 10, veteran.unwrapped], [true, 10], 'the gifts run out before the levels do');
});

test('reaching out is remembered for the island, briefly and without the whole message', () => {
  const house = emptyHouse();
  const agents = ['Mayor', 'Music'];
  assert.equal(applyOp(house, 'Mayor', { do: 'tell', agent: 'Music', text: '  Prepare   the single ' }, { agents, now: 5 }).ok, true);
  assert.deepEqual(house.exchanges.map(({ from, to, kind, gist, at }) => ({ from, to, kind, gist, at })), [{ from: 'Mayor', to: 'Music', kind: 'note', gist: 'Prepare the single', at: 5 }]);
  for (let i = 0; i < 50; i++) logExchange(house, 'Music', 'Mayor', 'talk', `n${i}`);
  assert.equal(house.exchanges.length, 40);
  assert.equal(house.exchanges.at(-1).gist, 'n49');
  logExchange(house, 'Music', 'Mayor', 'note', 'x'.repeat(200));
  assert.equal(house.exchanges.at(-1).gist.length, 80);
});

test('an interview or an offer is stamped when the owner sets it, so the dock can celebrate', () => {
  const board = { items: [{ url: 'u', status: 'new' }], gone: [] };
  assert.equal(changeJob(board, { action: 'status', url: 'u', status: 'interview' }, 123), null);
  assert.deepEqual(board.items[0], { url: 'u', status: 'interview', changed: 123 });
});
