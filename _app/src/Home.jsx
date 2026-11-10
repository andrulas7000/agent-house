import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildRoom, drawRoom, lookOf, portraitUrl } from './art.js';
import { CLAUDE_LEVELS, defaultLevelOf, shown as spanish } from './layout.js'; // Home has its own `shown`, the typewriter's progress
import { isEngineer, isGod, isJobs, moodOf, routineOf } from './news.js';
import Office, { JOB_ROOMS } from './Office.jsx';

const MARK = { done: 'Hecho', missed: 'Sin cumplir', partial: 'Parcial', open: 'Pendiente' };
const QUICK = { daily: 'Diario', weekly: 'Semanal', grades: 'Notas', music: 'Música', debrief: 'Balance', session: 'Sesión' }; // protocol files keep their English names
const ROOM_MIN_WIDTH = 250; // art pixels, enough for all the furniture around the resident
const ROOM_MIN_HEIGHT = 130;
const MIN_SCALE = 2;
const MAX_SCALE = 6;
const STACKED_BELOW = 760; // phones: the room sits above the chat instead of behind it
const FRAME_MS = 40;
const IRIS_MS = 350; // the run in starts as the iris opens
const TYPE_MS = 30;
const TYPE_TICKS = 90; // a reply of any length finishes typing in about this many ticks
const NEAR_BOTTOM_PX = 80;
const COPIED_MS = 1500;
const MAX_NOTES_SHOWN = 2;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const nameOf = (path) => path.split(/[\\/]/).pop();
const drafts = new Map(); // what you were typing survives a trip back to the island

export function Inline({ text }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function sinceVisit(ts) {
  if (!ts) return 'Aún no han hablado';
  const hours = (Date.now() - ts) / 3600e3;
  if (hours < 1) return 'Hablaron en la última hora';
  if (hours < 24) return `Última charla hace ${Math.floor(hours)} h`;
  return `Última charla hace ${Math.floor(hours / 24)} d`;
}

/** Reveals only replies that arrive while you're in the room. Old ones are already there when you walk in. */
function useTypewriter(text, chat, count) {
  const [shown, setShown] = useState(Infinity);
  const seen = useRef({ chat, count });
  useEffect(() => {
    const was = seen.current;
    if (was.chat === chat && was.count === count) return undefined;
    seen.current = { chat, count };
    if (was.chat !== chat || !text || reducedMotion()) { // opening a conversation isn't a reply arriving
      setShown(Infinity);
      return undefined;
    }
    setShown(0);
    const step = Math.max(1, Math.ceil(text.length / TYPE_TICKS));
    const timer = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          clearInterval(timer);
          return Infinity;
        }
        return n + step;
      });
    }, TYPE_MS);
    return () => clearInterval(timer);
  }, [chat, count, text]);
  return shown;
}

export function LevelSelect({ agent, value, onChange }) {
  return (
    <select aria-label={`Nivel de Claude de ${spanish(agent)}`} value={value ?? defaultLevelOf(agent)} onChange={(e) => onChange(e.target.value)}>
      {CLAUDE_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
    </select>
  );
}

const GLYPHS = {
  plus: ['...X...', '...X...', '...X...', 'XXXXXXX', '...X...', '...X...', '...X...'],
  down: ['...X...', '...X...', '...X...', 'X..X..X', '.XXXXX.', '..XXX..', '...X...'],
  copy: ['..XXXXX', '..X...X', 'XXXXX.X', 'X...X.X', 'X...XXX', 'X...X..', 'XXXXX..'],
  check: ['......X', '.....XX', 'X...XX.', 'XX.XX..', '.XXX...', '..X....', '.......'],
  x: ['X.....X', '.X...X.', '..X.X..', '...X...', '..X.X..', '.X...X.', 'X.....X'],
  file: ['XXXX...', 'X..XX..', 'X...XX.', 'X....X.', 'X....X.', 'X....X.', 'XXXXXX.'],
  edit: ['.....XX', '....X.X', '...X.X.', '..X.X..', '.X.X...', 'XX.....', 'XXX....'],
};

function Glyph({ name, scale = 2 }) {
  return (
    <svg className="glyph" width={7 * scale} height={7 * scale} viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      {GLYPHS[name].flatMap((row, y) => [...row].map((k, x) => (k === 'X' ? <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} /> : null)))}
    </svg>
  );
}

function CopyButton({ read, label = 'Copiar', className = '' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(read());
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  };
  return (
    <button type="button" className={`ghost ${className}`} aria-label={copied ? 'Copiado' : label} title={copied ? 'Copiado' : label} onClick={copy}>
      <Glyph name={copied ? 'check' : 'copy'} />
    </button>
  );
}

function CodeBlock({ children }) {
  const ref = useRef(null);
  return (
    <div className="code">
      <CopyButton className="code-copy" label="Copiar código" read={() => ref.current.innerText} />
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

// react-markdown builds real elements and ignores raw HTML, so a reply can't inject anything into the page.
const REPLY_PARTS = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ node, ...props }) => <div className="table-wrap"><table {...props} /></div>,
};
const REPLY_PLUGINS = [remarkGfm];

function Reply({ text, full }) {
  return (
    <div className="m-agent">
      <div className="prose"><Markdown remarkPlugins={REPLY_PLUGINS} components={REPLY_PARTS}>{text}</Markdown></div>
      <div className="m-tools"><CopyButton read={() => full} label="Copiar respuesta" /></div>
    </div>
  );
}

function Attachment({ path, pending, onRemove }) {
  return (
    <li className={`att${pending ? ' is-pending' : ''}`} title={path}>
      <Glyph name="file" />
      <span>
        <b>{pending ? path : nameOf(path)}</b>
        <small>{pending ? 'Subiendo…' : path}</small>
      </span>
      {onRemove && <button type="button" className="ghost" aria-label={`Quitar ${nameOf(path)}`} onClick={onRemove}><Glyph name="x" /></button>}
    </li>
  );
}

function Notes({ notes }) {
  const lines = notes.map((m, i) => <p key={i} className="m-note"><Inline text={m.text} /></p>);
  if (notes.length <= MAX_NOTES_SHOWN) return lines;
  return (
    <details className="m-notes">
      <summary>{notes.length} novedades de la isla</summary>
      {lines}
    </details>
  );
}

/** The bar above a conversation: which one this is, the others, and a fresh one. */
function ChatBar({ chats, current, busy, onOpen, onNew, onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [arming, setArming] = useState(null); // deleting takes a second click on the same button
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (!rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const finishRename = async (chat, value) => {
    const title = value.trim();
    const keep = cancelled.current || !title || title === chat.title;
    cancelled.current = false;
    setEditing(null);
    if (!keep) setError((await onRename(chat.id, title)) ?? '');
  };
  const remove = async (id) => {
    setArming(null);
    setError((await onDelete(id)) ?? '');
  };

  return (
    <div className="chats" ref={rootRef} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <div className="chats-bar">
        <button type="button" className="chats-toggle" aria-expanded={open} aria-label="Tus conversaciones" onClick={() => setOpen(!open)}>
          <Glyph name="down" />
          <span>{chats.find((c) => c.id === current)?.title ?? 'Conversación nueva'}</span>
        </button>
        <button type="button" className="btn" onClick={() => { onNew(); setOpen(false); }}>Nueva</button>
      </div>
      {open && (
        <div className="chats-pop">
          {chats.length === 0 && <p className="quiet">Aún no hay conversaciones. Di algo y empieza aquí.</p>}
          <ul>
            {chats.map((c) => (
              <li key={c.id} className={c.id === current ? 'is-current' : undefined}>
                {editing === c.id
                  ? (
                    <input
                      autoFocus
                      defaultValue={c.title}
                      maxLength={80}
                      aria-label={`Título nuevo para ${c.title}`}
                      onBlur={(e) => finishRename(c, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                        if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; e.target.blur(); }
                      }}
                    />
                  )
                  : (
                    <button type="button" className="chat-pick" aria-current={c.id === current ? 'true' : undefined} onClick={() => { onOpen(c.id); setOpen(false); }}>
                      <span>{c.title}</span>
                      <time>{new Date(c.at).toLocaleDateString('es', { month: 'short', day: 'numeric' })}</time>
                    </button>
                  )}
                <button type="button" className="ghost" aria-label={`Renombrar ${c.title}`} title="Renombrar" onClick={() => setEditing(c.id)}><Glyph name="edit" /></button>
                <button
                  type="button"
                  className={`ghost chat-delete${arming === c.id ? ' is-armed' : ''}`}
                  disabled={busy}
                  aria-label={arming === c.id ? `Confirmar borrar ${c.title}` : `Borrar ${c.title}`}
                  title={busy ? 'Espera a que termine' : 'Borrar'}
                  onClick={() => (arming === c.id ? remove(c.id) : setArming(c.id))}
                  onBlur={() => setArming(null)}
                >
                  {arming === c.id ? '¿Borrar?' : <Glyph name="x" />}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="box-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Room({ look, working, phase, asleep, sleeping, room: place }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState(null);
  const entrance = useRef(working || reducedMotion() ? null : { asleep, start: performance.now() + IRIS_MS });

  useLayoutEffect(() => {
    const el = hostRef.current;
    const measure = () => {
      // The chat floats over the right of the room, so the resident is centred in what's left.
      const wide = el.clientWidth > STACKED_BELOW;
      const panel = wide ? el.parentElement.querySelector('.chat').offsetWidth + 16 : 0;
      const menu = wide && el.parentElement.querySelector('.office-menu'); // Jobs' buttons run down the left
      const next = { vw: el.clientWidth, vh: el.clientHeight, free: el.clientWidth - panel, left: menu ? Math.ceil(menu.getBoundingClientRect().right) + 12 : 0, dpr: devicePixelRatio };
      setSize((old) => (old && Object.keys(next).every((k) => old[k] === next[k]) ? old : next));
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  const view = useMemo(() => {
    if (!size?.vw) return null;
    // Whole device pixels per art pixel, the same rule as the island. Jobs' menu doesn't count against the width,
    // or its rooms would come out smaller than everyone else's: the scene just packs in to the right of it.
    const fit = Math.min((size.free * size.dpr) / ROOM_MIN_WIDTH, (size.vh * size.dpr) / ROOM_MIN_HEIGHT);
    const dev = Math.min(Math.floor(MAX_SCALE * size.dpr), Math.max(Math.ceil(MIN_SCALE * size.dpr), Math.floor(fit)));
    const s = dev / size.dpr;
    return { s, LW: Math.ceil(size.vw / s), LH: Math.ceil(size.vh / s), focus: Math.ceil(size.free / s), left: Math.ceil(size.left / s) };
  }, [size]);
  const room = useMemo(() => (view ? buildRoom(view, look, phase, place) : null), [view, look, phase, place]);

  useEffect(() => {
    if (!room) return undefined;
    const g = canvasRef.current.getContext('2d');
    const still = reducedMotion();
    const frame = () => drawRoom(g, room, look, working, still ? 0 : performance.now(), entrance.current, sleeping);
    frame();
    const id = setInterval(frame, FRAME_MS);
    return () => clearInterval(id);
  }, [room, look, working, sleeping]);

  return (
    <div className="room-host" ref={hostRef} aria-hidden="true">
      {view && <canvas ref={canvasRef} width={view.LW} height={view.LH} style={{ width: view.LW * view.s, height: view.LH * view.s }} />}
    </div>
  );
}

export default function Home({ asleep, agent, messages, chats, chatId, loaded, onOpenChat, onNewChat, onRenameChat, onDeleteChat, live, phase, level, onLevel, onSend, onStop, onLeave, room, jobs, onRoom, onJobs }) {
  const slot = `${agent.name}|${room ?? ''}`; // the interview room keeps its own draft
  const [draft, setDraft] = useState(() => drafts.get(slot)?.draft ?? '');
  const [files, setFiles] = useState(() => drafts.get(slot)?.files ?? []);
  const [attachError, setAttachError] = useState('');
  const [levelError, setLevelError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [wokenUp] = useState(() => routineOf(agent.name) === 'asleep' && !isGod(agent.name));
  const [wide] = useState(() => matchMedia('(min-width: 900px)').matches);
  const threadRef = useRef(null);
  const stick = useRef(true);
  const look = lookOf(agent.name);

  const newestIndex = messages.findLastIndex((m) => m.role === 'agent');
  const newest = newestIndex >= 0 ? messages[newestIndex].text : '';
  const shown = useTypewriter(newest, loaded ? chatId : null, messages.filter((m) => m.role === 'agent').length);
  const turnHere = Boolean(live.busy) && (!live.chat || live.chat === chatId);
  const errorHere = live.error && (!live.chat || live.chat === chatId);
  const typing = shown < newest.length;
  const doneCount = agent.today?.items.filter((i) => i.status === 'done').length ?? 0;
  const sleeping = Boolean(asleep) && !live.busy;
  const wakes = asleep && new Date(asleep).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });
  const status = live.busy ? `${live.activity ?? 'Pensando'}…` : sleeping ? `Durmiendo hasta las ${wakes}` : sinceVisit(agent.lastVisit);
  const back = room ? (e) => onRoom(null, e) : onLeave;
  const facts = [JOB_ROOMS[room] ?? null, agent.streak ? `Racha de ${agent.streak} días` : null, agent.misses ? `${agent.misses} sin cumplir esta semana` : null, agent.waiting ? `${agent.waiting} ${agent.waiting === 1 ? 'nota' : 'notas'} en espera` : null].filter(Boolean);
  const uploading = files.some((f) => f.pending);
  const canSend = !live.busy && !sleeping && !uploading && Boolean(draft.trim() || files.length);
  const levelLabel = CLAUDE_LEVELS.find((l) => l.id === (level ?? defaultLevelOf(agent.name)))?.label;

  useEffect(() => { drafts.set(slot, { draft, files: files.filter((f) => !f.pending) }); }, [slot, draft, files]);

  const toBottom = () => { threadRef.current.scrollTop = threadRef.current.scrollHeight; };
  useLayoutEffect(() => { // every conversation opens at its latest message
    stick.current = true;
    setAtBottom(true);
  }, [chatId]);
  useLayoutEffect(() => { if (stick.current) toBottom(); }, [chatId, messages.length, shown, live.busy, live.activity, live.error]);
  const onScroll = () => {
    const el = threadRef.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    setAtBottom(stick.current);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !draft && !files.length) back(e); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, files.length, back]);

  const submit = (text, attached = files.map((f) => f.path)) => {
    const clean = text.trim();
    if ((!clean && !attached.length) || live.busy || sleeping || uploading) return;
    stick.current = true;
    setAtBottom(true);
    onSend(clean, attached);
    setDraft('');
    setFiles([]);
  };

  /** Windows' own file dialog, opened by the local server, because a browser never reveals a file's real path. */
  const pickFiles = async () => {
    setAttachError('');
    try {
      const res = await fetch('/api/pick-files', { method: 'POST' });
      const reply = await res.json();
      if (!res.ok) throw new Error(reply.error);
      setFiles((cur) => [...cur, ...reply.files.filter((p) => !cur.some((f) => f.path === p)).map((path) => ({ path }))]);
    } catch (err) {
      setAttachError(err.message || 'No se pudo abrir el selector de archivos.');
    }
  };

  /** Dropped or pasted files have no path a browser can see, so they're saved locally and referenced there. */
  const uploadFiles = (list) => [...list].forEach(async (file) => {
    const id = `${file.name}-${file.size}-${Math.random()}`;
    setAttachError('');
    setFiles((cur) => [...cur, { path: file.name || 'Archivo pegado', pending: true, id }]);
    try {
      const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name || 'pasted')}`, { method: 'POST', body: file });
      const reply = await res.json();
      if (!res.ok) throw new Error(reply.error);
      setFiles((cur) => cur.map((f) => (f.id === id ? { path: reply.path } : f)));
    } catch (err) {
      setFiles((cur) => cur.filter((f) => f.id !== id));
      setAttachError(err.message || `No se pudo adjuntar ${file.name}.`);
    }
  });

  const hasFiles = (e) => [...e.dataTransfer.types].includes('Files');
  const blocks = [];
  messages.forEach((m, i) => {
    if (m.role === 'note' && blocks.at(-1)?.notes) blocks.at(-1).notes.push(m);
    else blocks.push(m.role === 'note' ? { notes: [m], key: i } : { message: m, key: i, index: i });
  });

  return (
    <div className="home">
      <Room look={look} working={Boolean(live.busy)} phase={phase} asleep={wokenUp} sleeping={sleeping} room={room} />

      <div className="home-side">
        <button type="button" className="btn" onClick={onLeave}>Volver a la isla</button>
        {room && <button type="button" className="btn" onClick={(e) => onRoom(null, e)}>Ir a casa</button>}
        {isJobs(agent.name) && <Office room={room} jobs={jobs} onAct={onJobs} onRoom={onRoom} />}
      </div>

      {agent.today?.items.length > 0 && (
        <details className="pin" open={wide}>
          <summary>Hoy <span>{doneCount} de {agent.today.items.length}</span></summary>
          <ul>
            {agent.today.items.map((item, i) => (
              <li key={i}>
                <span className={`tick tick-${item.status}`} role="img" aria-label={MARK[item.status]} />
                <span>{item.text}</span>
                {item.when && <time>{item.when}</time>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <aside className="who frame">
        <img src={portraitUrl(look, moodOf(agent, live), typing && Math.floor(shown / 24) % 2 === 1)} alt="" width={96} height={120} />
        <div>
          <h2>{spanish(agent.name)}</h2>
          <p role="status">{status}</p>
          {facts.map((f) => <small key={f}>{f}</small>)}
          {isEngineer(agent.name)
            ? (
              <label className="level-pick">
                Claude
                <LevelSelect agent={agent.name} value={level} onChange={async (model) => setLevelError((await onLevel(model)) ?? '')} />
              </label>
            )
            : <small>Claude {levelLabel}</small>}
        </div>
      </aside>

      <main
        className={`chat frame${dragging ? ' is-dragging' : ''}`}
        aria-label={`Conversación con ${spanish(agent.name)}`}
        style={{ '--wall': look.wall, '--wall-ink': look.ink }}
        onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); } }}
      >
        <ChatBar chats={chats} current={chatId} busy={Boolean(live.busy)} onOpen={onOpenChat} onNew={onNewChat} onRename={onRenameChat} onDelete={onDeleteChat} />

        <div className="thread" ref={threadRef} onScroll={onScroll} role="log" aria-live="polite">
          {loaded && messages.length === 0 && !turnHere && (
            <div className="hello">
              <p><b>{spanish(agent.name)}</b> te está esperando.</p>
              {room === 'entrevistas' && <p>Dile a qué puesto te presentas y empieza la entrevista de prueba.</p>}
              {room === 'puerto' && <p>Aquí se busca empleo: mándalo en el barco o pídele que revise el tablón contigo.</p>}
              {room ? null : agent.hasPrompt ? <p>Saluda para empezar.</p> : <p>Esta carpeta aún no tiene CLAUDE.md, así que es una página en blanco. Dile quién debe ser y podrá escribir el suyo.</p>}
            </div>
          )}
          {blocks.map((b) => {
            if (b.notes) return <Notes key={b.key} notes={b.notes} />;
            if (b.message.role === 'agent') return <Reply key={b.key} full={b.message.text} text={b.index === newestIndex && typing ? newest.slice(0, shown) : b.message.text} />;
            return (
              <div key={b.key} className="m-user">
                {b.message.files?.length > 0 && <ul className="atts">{b.message.files.map((path) => <Attachment key={path} path={path} />)}</ul>}
                {b.message.text && <div className="bubble">{b.message.text}</div>}
              </div>
            );
          })}
          {turnHere && <p className="pending" role="status"><i /><i /><i /><span>{live.activity ?? 'Pensando'}</span></p>}
          {errorHere && (
            <div className="slip" role="alert">
              <p>{live.error}</p>
              <button type="button" onClick={() => onSend(live.lastText, live.lastFiles)}>Reintentar</button>
            </div>
          )}
        </div>

        {!atBottom && <button type="button" className="btn to-bottom" aria-label="Ir al último mensaje" onClick={() => { stick.current = true; setAtBottom(true); toBottom(); }}><Glyph name="down" /></button>}

        {agent.quick.length > 0 && messages.length === 0 && !room && (
          <div className="quick">
            {agent.quick.map((q) => <button type="button" key={q} disabled={live.busy} onClick={() => submit(`Hagamos el protocolo ${q}.`, [])}>{QUICK[q] ?? q}</button>)}
          </div>
        )}
        <form className="box" onSubmit={(e) => { e.preventDefault(); submit(draft); }}>
          {files.length > 0 && (
            <ul className="atts">
              {files.map((f) => <Attachment key={f.id ?? f.path} path={f.path} pending={f.pending} onRemove={f.pending ? undefined : () => setFiles((cur) => cur.filter((x) => x !== f))} />)}
            </ul>
          )}
          <div className="box-row">
            <button type="button" className="btn attach" aria-label="Adjuntar archivos de tu computador" title="Adjuntar archivos" onClick={pickFiles}><Glyph name="plus" /></button>
            <label className="sr-only" htmlFor="draft">Mensaje para {spanish(agent.name)}</label>
            <textarea
              id="draft"
              rows={1}
              maxLength={20000}
              value={draft}
              autoFocus
              placeholder={sleeping ? `${spanish(agent.name)} duerme: tu límite de Claude está al 100%. Despierta a las ${wakes}.` : live.busy && !turnHere ? `${spanish(agent.name)} sigue en otra conversación` : `Dile algo a ${spanish(agent.name)}`}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); uploadFiles(e.clipboardData.files); } }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit(draft);
                }
              }}
            />
            {turnHere
              ? <button type="button" className="btn btn-stop send" onClick={onStop}>Parar</button>
              : <button type="submit" className="btn send" disabled={!canSend}>Enviar</button>}
          </div>
          {(attachError || levelError) && <p className="box-error" role="alert">{attachError || levelError}</p>}
        </form>
        {dragging && <div className="drop-hint" aria-hidden="true">Suelta los archivos para adjuntarlos</div>}
      </main>
    </div>
  );
}
