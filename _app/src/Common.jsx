import { useEffect, useRef, useState } from 'react';
import { lookOf, portraitUrl } from './art.js';
import { Inline, LevelSelect } from './Home.jsx';
import { CLAUDE_LEVELS, shown } from './layout.js';
import Calendar, { dayLabel, whoName } from './Calendar.jsx';

const TABS = ['Calendario', 'Metas', 'Reunión', 'Residentes'];
const LEVELS = [
  ['priority', 'Prioridad', 'Reserva por encima de los niveles inferiores y puede quitar sus eventos.'],
  ['member', 'Miembro', 'Reserva huecos libres y gestiona sus propios eventos.'],
  ['read', 'Solo lectura', 'Ve el área común y no puede cambiarla.'],
];
const whenLabel = (ts) => new Date(ts).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Runs a change, keeps the form's text on failure, and shows why it was refused. */
function useAction(onAct) {
  const [error, setError] = useState('');
  const run = async (op, onDone) => {
    const refused = await onAct(op);
    setError(refused ?? '');
    if (!refused) onDone?.();
  };
  return [error, run];
}

function Goals({ house, onAct }) {
  const [text, setText] = useState('');
  const [error, run] = useAction(onAct);
  const done = house.goals.filter((g) => g.done).length;
  const total = house.goals.length;

  const add = (e) => {
    e.preventDefault();
    run({ do: 'goal', text }, () => setText(''));
  };

  return (
    <>
      <div className="goal-head">
        <h3>Semana del {dayLabel(house.week)}</h3>
        <b>{done} de {total}</b>
      </div>
      <span className="bar bar-big" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Metas semanales hechas">
        <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      {total === 0 && <p className="quiet">Esta semana no hay metas. Añade una aquí, o deja que los residentes las definan en una reunión.</p>}
      <ul className="goals">
        {house.goals.map((g) => (
          <li key={g.id} className={g.done ? 'is-done' : undefined}>
            <label>
              <input type="checkbox" checked={g.done} onChange={(e) => run({ do: 'check', id: g.id, done: e.target.checked })} />
              <span>{g.text}</span>
            </label>
            <small>{whoName(g.by)}</small>
            <button type="button" className="x" aria-label={`Quitar ${g.text}`} onClick={() => run({ do: 'drop', id: g.id })}>×</button>
          </li>
        ))}
      </ul>
      <form className="add-form" onSubmit={add}>
        <label className="wide">Meta nueva<input value={text} maxLength={160} onChange={(e) => setText(e.target.value)} required /></label>
        <button type="submit" className="action">Añadir meta</button>
        {error && <p className="refused" role="alert">{error}</p>}
      </form>
    </>
  );
}

function Transcript({ lines }) {
  return (
    <div className="transcript">
      {lines.map((l, i) => (l.note
        ? <p key={i} className="msg msg-note">{shown(l.who)}: {l.text}</p>
        : <div key={i} className="transcript-line"><img src={portraitUrl(lookOf(l.who))} alt="" /><p className="msg msg-agent"><b>{shown(l.who)}</b><Inline text={l.text} /></p></div>))}
    </div>
  );
}

function Meeting({ house, onAct, onMeeting }) {
  const [error, setError] = useState('');
  const [, run] = useAction(onAct);
  const live = house.live;
  const latest = house.log[0];
  const older = house.log.slice(1);

  const press = async (action) => setError((await onMeeting(action)) ?? '');

  return (
    <>
      <div className="meeting-head">
        {live
          ? <button type="button" className="action stop" onClick={() => press('stop')}>Detener la reunión</button>
          : <button type="button" className="action" onClick={() => press('start')}>Convocar una reunión</button>}
        <label className="check">
          <input type="checkbox" checked={house.auto} onChange={(e) => run({ do: 'auto', on: e.target.checked })} />
          <span>Cada domingo a las 18:00</span>
        </label>
      </div>
      <p className="quiet">
        {live
          ? (live.stopped ? 'Deteniendo…' : `${live.speaker ? shown(live.speaker) : 'Alguien'} tiene la palabra.`)
          : 'Cada residente con CLAUDE.md toma un turno y quien preside define la semana. Si la casa está cerrada el domingo, se hace la próxima vez que la abras.'}
      </p>
      {error && <p className="refused" role="alert">{error}</p>}
      {live && <Transcript lines={live.lines} />}
      {!live && latest && (
        <>
          <h3>Última reunión, {whenLabel(latest.at)}{latest.stopped ? ', detenida antes de tiempo' : ''}</h3>
          <Transcript lines={latest.lines} />
        </>
      )}
      {older.map((m) => (
        <details key={m.at} className="past">
          <summary>{whenLabel(m.at)}</summary>
          <Transcript lines={m.lines} />
        </details>
      ))}
    </>
  );
}

function Residents({ agents, house, onAct }) {
  const [error, run] = useAction(onAct);
  return (
    <>
      <ul className="residents">
        {agents.map((a) => (
          <li key={a.name}>
            <img src={portraitUrl(lookOf(a.name))} alt="" />
            <b>{shown(a.name)}</b>
            <div className="resident-field">
              <span>Acceso</span>
              {house.tiers[a.name] === 'god' || house.tiers[a.name] === 'mayor'
                ? <span className="god-tag">{house.tiers[a.name] === 'god' ? 'Puede cambiar a cualquiera' : 'Dirige la casa'}</span>
                : (
                  <select aria-label={`Nivel de acceso de ${shown(a.name)}`} value={house.tiers[a.name]} onChange={(e) => run({ do: 'tier', agent: a.name, level: e.target.value })}>
                    {LEVELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                )}
            </div>
            <div className="resident-field">
              <span>Claude</span>
              <LevelSelect agent={a.name} value={house.models?.[a.name]} onChange={(model) => run({ do: 'model', agent: a.name, model })} />
            </div>
            <div className="resident-field">
              <span>Internet</span>
              <select aria-label={`Internet de ${shown(a.name)}`} value={house.web?.[a.name] === false ? 'off' : 'on'} onChange={(e) => run({ do: 'web', agent: a.name, on: e.target.value === 'on' })}>
                <option value="on">Sí</option>
                <option value="off">No</option>
              </select>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="refused" role="alert">{error}</p>}
      <div className="legends">
        <dl className="levels">
          {LEVELS.map(([value, label, help]) => <div key={value}><dt>{label}</dt><dd>{help}</dd></div>)}
          <div><dt>Internet</dt><dd>Permite a un residente buscar y leer en la web.</dd></div>
        </dl>
        <dl className="levels">
          {CLAUDE_LEVELS.map((l) => <div key={l.id}><dt>{l.label}</dt><dd>{l.help}</dd></div>)}
        </dl>
      </div>
    </>
  );
}

export default function Common({ agents, house, onAct, onMeeting, onLeave }) {
  const [tab, setTab] = useState(house.live ? 'Reunión' : 'Calendario');
  const pressedOutside = useRef(false); // so a drag that merely ends out there doesn't close the square

  useEffect(() => {
    // Calendar's own Escape closes its editor first, so only leave when no editor is open.
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.cal-editor')) onLeave(e); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onLeave]);

  return (
    <div
      className="square"
      onPointerDown={(e) => { pressedOutside.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedOutside.current && e.target === e.currentTarget) onLeave(e); }}
    >
      <section className="square-board frame" aria-label="Plaza del pueblo">
        <header className="square-head">
          <h2>Plaza del pueblo</h2>
          <p role="status">{house.live ? 'Reunión del pueblo en curso' : 'Donde se reúnen los residentes'}</p>
          <button type="button" className="btn" onClick={onLeave}>Volver a la isla</button>
        </header>
        <div className="tabs" role="tablist">
          {TABS.map((t) => <button type="button" role="tab" key={t} aria-selected={t === tab} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        <div className="tab-body">
          {tab === 'Calendario' && <Calendar house={house} onAct={onAct} />}
          {tab === 'Metas' && <Goals house={house} onAct={onAct} />}
          {tab === 'Reunión' && <Meeting house={house} onAct={onAct} onMeeting={onMeeting} />}
          {tab === 'Residentes' && <Residents agents={agents} house={house} onAct={onAct} />}
        </div>
      </section>
    </div>
  );
}
