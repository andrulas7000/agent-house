import assert from 'node:assert/strict';
import test from 'node:test';
import { islandView, packLane } from './layout.js';
import { dockOf } from './art.js';

test('God stays above the first screen, at any window size', () => {
  for (const [vw, vh, dpr] of [[1536, 730, 1.25], [1920, 1080, 1], [2560, 1440, 1], [800, 600, 1]]) {
    const v = islandView(vw, vh, 331, dpr);
    const firstScreenTop = Math.min(v.cy - vh / v.s / 2, v.LH - vh / v.s);
    assert.ok(v.cy + v.godY < firstScreenTop, `visible without scrolling at ${vw}x${vh}`);
    assert.ok(v.cy + v.godY - 60 >= 0, `off the top of the map at ${vw}x${vh}`);
  }
});

test('packLane never overlaps or leaves the strip, at any width', () => {
  const widths = [60, 18, 28, 34];
  for (let room = 0; room < 240; room++) {
    const lefts = packLane(widths, room);
    lefts.forEach((left, i) => {
      assert.ok(left >= 0 && left + widths[i] <= room, `item ${i} leaves a strip of ${room}`);
      if (i) assert.ok(left >= lefts[i - 1] + widths[i - 1], `item ${i} overlaps at ${room}`);
    });
  }
});

test('packLane drops the last items first', () => {
  assert.equal(packLane([60, 18, 28], 80).length, 2);
  assert.equal(packLane([60, 18, 28], 59).length, 0);
});

test('moored boats never touch the planks', () => {
  const dock = dockOf(331);
  const [north, end] = dock.boats;
  assert.ok(north.y + 1 < dock.y - 1, 'the north boat, even at the top of its bob, stays above the dock');
  assert.ok(end.x - 18 >= dock.x + dock.w + 1, 'the far boat starts past the end of the dock');
  assert.ok(end.x + 18 <= 331 + 20, 'and stays on the map at its narrowest');
});
