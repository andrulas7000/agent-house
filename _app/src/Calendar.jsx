import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { lookOf } from './art.js';
import { addDays, clockOf, laneOut, minuteOf, shown } from './layout.js';

const HOUR_PX = 48;
const SNAP = 15;
const DAY_MINUTES = 1440;
const DRAG_THRESHOLD_PX = 4;
const SHORTEST_PX = 16;
const EDGE_PX = 40;
const OWNER_LOOK = { wall: '#ffd95a', ink: '#2a1c2e' };
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export const whoName = (by) => (by === '_you' ? 'Tú' : shown(by));
export const dayLabel = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });

const clamp = (n, low, high) => Math.min(Math.max(n, low), high);
const snap = (m) => Math.round(m / SNAP) * SNAP;
const mondayOf = (day) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const clockDay = (d) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const lookFor = (by) => (by === '_you' ? OWNER_LOOK : lookOf(by));

function Block({ event, lane, lanes, selected, onOpen }) {
  const look = lookFor(event.by);
  const start = minuteOf(event.time);
  const style = {
    top: (start / 60) * HOUR_PX,
    height: Math.max(SHORTEST_PX, (Math.min(event.minutes, DAY_MINUTES - start) / 60) * HOUR_PX - 2),
    left: `${(lane / lanes) * 100}%`,
    width: `calc(${100 / lanes}% - 3px)`,
    '--block': look.wall,
    '--block-ink': look.ink,
  };
  const classes = `block${selected ? ' is-selected' : ''}${event.bumped ? ' is-bumped' : ''}`;
  const body = (
    <>
      <b>{event.title}</b>
      <small>{event.time}</small>
    </>
  );
  if (!event.id) return <div className={`${classes} is-draft`} style={style}>{body}</div>;
  return (
    <button
      type="button"
      className={classes}
      style={style}
      data-id={event.id}
      onClick={() => onOpen(event)}
      aria-label={`${event.title}, ${dayLabel(event.day)} a las ${event.time}, ${event.minutes} minutos, ${whoName(event.by)}${event.bumped ? `, desplazado por ${whoName(event.bumped)}` : ''}`}
    >
      {body}
      <span className="block-resize" data-resize />
    </button>
  );
}

function Editor({ editor, held, titleRef, onChange, onSave, onDelete, onClose }) {
  const set = (field) => (e) => onChange({ ...editor, [field]: e.target.value });
  return (
    <form className="cal-editor" onSubmit={onSave}>
      <label className="wide">Bloque
        <input ref={titleRef} value={editor.title} maxLength={120} onChange={set('title')} placeholder="Qué va a pasar" required />
      </label>
      <label>Día<input type="date" value={editor.day} onChange={set('day')} required /></label>
      <label>Inicio<input type="time" value={editor.time} onChange={set('time')} /></label>
      <label>Minutos<input type="number" min={5} max={DAY_MINUTES} step={5} value={editor.minutes} onChange={set('minutes')} required /></label>
      <div className="cal-editor-actions">
        <button type="submit" className="action">{editor.id ? 'Guardar' : 'Reservar'}</button>
        {editor.id && <button type="button" className="action stop" onClick={onDelete}>Borrar</button>}
        <button type="button" className="plain" onClick={onClose}>Cancelar</button>
        {held && <small>{whoName(held.by)}{held.bumped ? `, desplazado por ${whoName(held.bumped)}` : ''}</small>}
      </div>
    </form>
  );
}

export default function Calendar({ house, onAct }) {
  const [view, setView] = useState(() => (matchMedia('(max-width: 620px)').matches ? 'day' : 'week'));
  const [cursor, setCursor] = useState(house.today);
  const [drag, setDrag] = useState(null);
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const titleRef = useRef(null);
  const press = useRef(null);

  const step = view === 'week' ? 7 : 1;
  const first = view === 'week' ? mondayOf(cursor) : cursor;
  const days = Array.from({ length: step }, (_, i) => addDays(first, i));
  const now = new Date();
  const today = clockDay(now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();

  useLayoutEffect(() => {
    scrollRef.current.scrollTop = Math.max(0, new Date().getHours() - 2) * HOUR_PX;
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        press.current = null;
        setDrag(null);
        setEditor(null);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
      const key = e.key.toLowerCase();
      if (key === 't') setCursor(house.today);
      if (key === 'w') setView('week');
      if (key === 'd') setView('day');
      if (key === 'j' || key === 'arrowright') setCursor((c) => addDays(c, step));
      if (key === 'k' || key === 'arrowleft') setCursor((c) => addDays(c, -step));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [house.today, step]);

  /** Sends a change. Returns true when the house accepted it, and shows why when it didn't. */
  const act = async (op) => {
    const refused = await onAct(op);
    setError(refused ?? '');
    return !refused;
  };

  const openDraft = (day, time, minutes = 60) => {
    setEditor((open) => ({ title: open && !open.id ? open.title : '', day, time, minutes }));
    setError('');
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const pointAt = (e) => {
    const box = gridRef.current.getBoundingClientRect();
    return {
      col: clamp(Math.floor(((e.clientX - box.left) / box.width) * days.length), 0, days.length - 1),
      minute: clamp(((e.clientY - box.top) / HOUR_PX) * 60, 0, DAY_MINUTES),
    };
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const at = pointAt(e);
    const base = { x: e.clientX, y: e.clientY, at, active: false, preview: null };
    const blockEl = e.target.closest('[data-id]');
    if (blockEl) {
      const event = house.events.find((x) => x.id === Number(blockEl.dataset.id));
      if (event) press.current = { ...base, mode: e.target.closest('[data-resize]') ? 'resize' : 'move', event };
      return;
    }
    press.current = { ...base, mode: 'new', anchor: Math.min(Math.floor(at.minute / SNAP) * SNAP, DAY_MINUTES - SNAP) };
  };

  const previewOf = (p, at) => {
    const shift = snap(at.minute - p.at.minute);
    if (p.mode === 'new') {
      const end = snap(at.minute);
      return { mode: 'new', day: days[p.at.col], start: Math.min(p.anchor, end), minutes: Math.max(SNAP, Math.abs(end - p.anchor)) };
    }
    const start = minuteOf(p.event.time);
    if (p.mode === 'resize') {
      const end = clamp(start + p.event.minutes + shift, start + SNAP, DAY_MINUTES);
      return { id: p.event.id, day: p.event.day, start, minutes: end - start };
    }
    return { id: p.event.id, day: days[at.col], start: clamp(start + shift, 0, DAY_MINUTES - p.event.minutes), minutes: p.event.minutes };
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (!p) return;
    if (!p.active) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD_PX) return;
      p.active = true;
      gridRef.current.setPointerCapture(e.pointerId); // captured only now, so a plain click still reaches the block
    }
    const view = scrollRef.current.getBoundingClientRect();
    if (e.clientY > view.bottom - EDGE_PX) scrollRef.current.scrollBy(0, SNAP);
    else if (e.clientY < view.top + EDGE_PX * 2) scrollRef.current.scrollBy(0, -SNAP); // the sticky header covers the top
    p.preview = previewOf(p, pointAt(e));
    setDrag(p.preview);
  };

  const onPointerUp = async () => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (!p.active) {
      if (p.mode !== 'new') return;
      if (editor?.id) setEditor(null);
      else openDraft(days[p.at.col], clockOf(p.anchor));
      return;
    }
    const { preview } = p;
    if (p.mode === 'new') {
      setDrag(null);
      openDraft(preview.day, clockOf(preview.start), preview.minutes);
      return;
    }
    const time = clockOf(preview.start);
    const changed = preview.day !== p.event.day || time !== p.event.time || preview.minutes !== p.event.minutes;
    if (changed) await act({ do: 'move', id: p.event.id, day: preview.day, time, minutes: preview.minutes });
    setDrag(null); // held until the answer arrives, so the block doesn't flick back first
    setEditor((open) => (open?.id === p.event.id ? null : open));
  };

  const onPointerCancel = () => {
    press.current = null;
    setDrag(null);
  };

  const openBlock = (event) => {
    setError('');
    setEditor({ id: event.id, title: event.title, day: event.day, time: event.time, minutes: event.minutes });
  };

  const save = async (e) => {
    e.preventDefault();
    const { id, title, day, time, minutes } = editor;
    const fields = { title, day, time, minutes: Number(minutes) };
    if (await act(id ? { do: 'move', id, ...fields } : { do: 'add', ...fields })) setEditor(null);
  };

  const remove = async () => {
    if (await act({ do: 'remove', id: editor.id })) setEditor(null);
  };

  // What's on screen is the house plus whatever is being dragged or typed, so overlaps re-flow live.
  const shown = house.events.map((e) => {
    if (drag?.id === e.id) return { ...e, day: drag.day, time: clockOf(drag.start), minutes: drag.minutes };
    if (editor?.id === e.id) return { ...e, title: editor.title || e.title, day: editor.day, time: editor.time, minutes: Number(editor.minutes) || e.minutes };
    return e;
  });
  if (drag?.mode === 'new') shown.push({ id: 0, title: 'Bloque nuevo', day: drag.day, time: clockOf(drag.start), minutes: drag.minutes, by: '_you' });
  else if (editor && !editor.id) shown.push({ id: 0, title: editor.title || 'Bloque nuevo', day: editor.day, time: editor.time, minutes: Number(editor.minutes) || 60, by: '_you' });

  const onScreen = shown.filter((e) => days.includes(e.day));
  const holders = [...new Set(onScreen.filter((e) => e.id).map((e) => e.by))];
  const month = new Date(`${days[0]}T12:00:00`).toLocaleDateString('es', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar">
      <div className="cal-bar">
        <button type="button" className="plain" title="T" onClick={() => setCursor(house.today)}>Hoy</button>
        <button type="button" className="plain" aria-label="Antes" title="K" onClick={() => setCursor(addDays(cursor, -step))}>‹</button>
        <button type="button" className="plain" aria-label="Después" title="J" onClick={() => setCursor(addDays(cursor, step))}>›</button>
        <h3>{month}</h3>
        <ul className="cal-legend">
          {holders.map((by) => <li key={by}><i style={{ background: lookFor(by).wall }} />{whoName(by)}</li>)}
        </ul>
        <span className="cal-views">
          {['day', 'week'].map((v) => <button type="button" key={v} className="plain" title={v[0].toUpperCase()} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'day' ? 'Día' : 'Semana'}</button>)}
        </span>
        <button type="button" className="action" onClick={() => openDraft(view === 'day' ? cursor : house.today, clockOf(Math.min(snap(nowMinute), DAY_MINUTES - SNAP)))}>Nuevo</button>
      </div>
      {error && <p className="refused" role="alert">{error}</p>}
      {house.sync && <p className="cal-sync" role="status">{house.sync}</p>}
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-head" style={{ '--days': days.length }}>
          <span />
          {days.map((d) => (
            <span key={d} className={`cal-day${d === house.today ? ' is-today' : ''}`}>
              <small>{new Date(`${d}T12:00:00`).toLocaleDateString('es', { weekday: 'short' })}</small>
              <b>{Number(d.slice(8))}</b>
            </span>
          ))}
          <span className="cal-gutter-label">todo el día</span>
          {days.map((d) => (
            <div key={d} className="cal-allday" onClick={(e) => { if (e.target === e.currentTarget) openDraft(d, ''); }}>
              {onScreen.filter((e) => e.day === d && !e.time).map((e) => {
                const look = lookFor(e.by);
                return e.id
                  ? <button type="button" key={e.id} className={`chip${e.bumped ? ' is-bumped' : ''}`} style={{ '--block': look.wall, '--block-ink': look.ink }} onClick={() => openBlock(e)}>{e.title}</button>
                  : <span key="draft" className="chip is-draft" style={{ '--block': look.wall, '--block-ink': look.ink }}>{e.title}</span>;
              })}
            </div>
          ))}
        </div>
        <div className="cal-body" style={{ height: 24 * HOUR_PX }}>
          <div className="cal-hours" aria-hidden="true">
            {HOURS.slice(1).map((h) => <span key={h} style={{ top: h * HOUR_PX }}>{clockOf(h * 60)}</span>)}
          </div>
          <div
            className="cal-columns"
            ref={gridRef}
            style={{ '--days': days.length }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {days.map((d) => {
              const timed = onScreen.filter((e) => e.day === d && e.time);
              const placed = laneOut(timed);
              return (
                <div key={d} className={`cal-col${d === house.today ? ' is-today' : ''}`}>
                  {timed.map((e) => <Block key={e.id} event={e} {...placed.get(e.id)} selected={editor?.id === e.id} onOpen={openBlock} />)}
                  {d === today && <i className="cal-now" style={{ top: (nowMinute / 60) * HOUR_PX }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {editor && (
        <Editor
          editor={editor}
          held={house.events.find((e) => e.id === editor.id)}
          titleRef={titleRef}
          onChange={setEditor}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
