import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildRoom, drawRoom, lookOf, portraitUrl } from './art.js';
import { CLAUDE_LEVELS, GIFTS, defaultLevelOf, shown as display } from './layout.js'; // Home has its own `shown`, the typewriter's progress
import { isEngineer, isGod, isJobs, moodOf, routineOf } from './news.js';
import Office, { JOB_ROOMS } from './Office.jsx';
import { Icon } from './Island.jsx';

const MARK = { done: 'Done', missed: 'Missed', partial: 'Partial', open: 'Open' };
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
  if (!ts) return 'You haven\'t talked yet';
  const hours = (Date.now() - ts) / 3600e3;
  if (hours < 1) return 'Talked in the last hour';
  if (hours < 24) return `Last talked ${Math.floor(hours)} h ago`;
  return `Last talked ${Math.floor(hours / 24)} d ago`;
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
    <select aria-label={`Claude level for ${display(agent)}`} value={value ?? defaultLevelOf(agent)} onChange={(e) => onChange(e.target.value)}>
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

function CopyButton({ read, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(read());
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  };
  return (
    <button type="button" className={`ghost ${className}`} aria-label={copied ? 'Copied' : label} title={copied ? 'Copied' : label} onClick={copy}>
      <Glyph name={copied ? 'check' : 'copy'} />
    </button>
  );
}

function CodeBlock({ children }) {
  const ref = useRef(null);
  return (
    <div className="code">
      <CopyButton className="code-copy" label="Copy code" read={() => ref.current.innerText} />
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
      <div className="m-tools"><CopyButton read={() => full} label="Copy reply" /></div>
    </div>
  );
}

function Attachment({ path, pending, onRemove }) {
  return (
    <li className={`att${pending ? ' is-pending' : ''}`} title={path}>
      <Glyph name="file" />
      <span>
        <b>{pending ? path : nameOf(path)}</b>
        <small>{pending ? 'Uploading…' : path}</small>
      </span>
      {onRemove && <button type="button" className="ghost" aria-label={`Remove ${nameOf(path)}`} onClick={onRemove}><Glyph name="x" /></button>}
    </li>
  );
}

function Notes({ notes }) {
  const lines = notes.map((m, i) => <p key={i} className="m-note"><Inline text={m.text} /></p>);
  if (notes.length <= MAX_NOTES_SHOWN) return lines;
  return (
    <details className="m-notes">
      <summary>{notes.length} updates from the island</summary>
      {lines}
    </details>
  );
}

/** Conversations to open, rename or delete. Deleting takes a second click on the same button. */
function ChatList({ chats, current, busy, onOpen, onRename, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [arming, setArming] = useState(null);
  const [error, setError] = useState('');
  const cancelled = useRef(false);

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
    <>
      <ul className="chat-list">
        {chats.map((c) => (
          <li key={c.id} className={c.id === current ? 'is-current' : undefined}>
            {editing === c.id
              ? (
                <input
                  autoFocus
                  defaultValue={c.title}
                  maxLength={80}
                  aria-label={`New title for ${c.title}`}
                  onBlur={(e) => finishRename(c, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.target.blur();
                    if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; e.target.blur(); }
                  }}
                />
              )
              : (
                <button type="button" className="chat-pick" aria-current={c.id === current ? 'true' : undefined} onClick={() => onOpen(c.id)}>
                  <span>{c.title}</span>
                  <time>{new Date(c.at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</time>
                </button>
              )}
            <button type="button" className="ghost" aria-label={`Rename ${c.title}`} title="Rename" onClick={() => setEditing(c.id)}><Glyph name="edit" /></button>
            <button
              type="button"
              className={`ghost chat-delete${arming === c.id ? ' is-armed' : ''}`}
              disabled={busy}
              aria-label={arming === c.id ? `Confirm delete ${c.title}` : `Delete ${c.title}`}
              title={busy ? 'Wait until it finishes' : 'Delete'}
              onClick={() => (arming === c.id ? remove(c.id) : setArming(c.id))}
              onBlur={() => setArming(null)}
            >
              {arming === c.id ? 'Delete?' : <Glyph name="x" />}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="box-error" role="alert">{error}</p>}
    </>
  );
}

/** The bar above a conversation: which one this is, the others, and a fresh one. */
function ChatBar({ chats, current, busy, onOpen, onNew, onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (!rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div className="chats" ref={rootRef} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <div className="chats-bar">
        <button type="button" className="chats-toggle" aria-expanded={open} aria-label="Your conversations" onClick={() => setOpen(!open)}>
          <Glyph name="down" />
          <span>{chats.find((c) => c.id === current)?.title ?? 'New conversation'}</span>
        </button>
        <button type="button" className="btn" onClick={() => { onNew(); setOpen(false); }}>New</button>
      </div>
      {open && (
        <div className="chats-pop">
          {chats.length === 0 && <p className="quiet">No conversations yet. Say something to start one here.</p>}
          <ChatList chats={chats} current={current} busy={busy} onOpen={(id) => { onOpen(id); setOpen(false); }} onRename={onRename} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}

/** A project's page, as on claude.ai: its name, the instructions all its conversations get, and those conversations. */
function ProjectPage({ project, chats, busy, onOpen, onRename, onDelete, onNew, onSave, onRemove }) {
  const [name, setName] = useState(project.name);
  const [notes, setNotes] = useState(project.instructions);
  const [error, setError] = useState('');
  const [arming, setArming] = useState(false);
  const changed = name.trim() !== project.name || notes !== project.instructions;
  const save = async (e) => {
    e.preventDefault();
    setError((await onSave({ name: name.trim(), instructions: notes })).error ?? '');
  };
  const remove = async () => {
    setArming(false);
    setError((await onRemove()).error ?? '');
  };

  return (
    <main className="chat project-page" aria-label={`Project ${project.name}`}>
      <form className="project-form" onSubmit={save}>
        <label>Project name<input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} /></label>
        <label>
          Project instructions
          <textarea value={notes} maxLength={8000} rows={6} placeholder="What it should know and how it should work in this project" onChange={(e) => setNotes(e.target.value)} />
        </label>
        <p className="quiet">They go with every message in this project's conversations.</p>
        <div className="project-actions">
          <button type="submit" className="plain" disabled={!changed || !name.trim()}>Save</button>
          <button type="button" className={`plain${arming ? ' is-armed' : ''}`} onClick={() => (arming ? remove() : setArming(true))} onBlur={() => setArming(false)}>
            {arming ? 'Delete? Its conversations stay' : 'Delete project'}
          </button>
        </div>
        {error && <p className="box-error" role="alert">{error}</p>}
      </form>
      <button type="button" className="side-new" onClick={onNew}><Glyph name="plus" />New conversation in this project</button>
      {chats.length === 0
        ? <p className="quiet">No conversations in this project yet.</p>
        : <ChatList chats={chats} current={null} busy={busy} onOpen={onOpen} onRename={onRename} onDelete={onDelete} />}
    </main>
  );
}

function Room({ look, working, phase, asleep, sleeping, away, gifts, room: place }) {
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
  const giftKey = (gifts ?? []).join('|'); // the list is new on every poll, its contents rarely are
  const room = useMemo(() => (view ? buildRoom(view, look, phase, place, away, giftKey ? giftKey.split('|') : []) : null), [view, look, phase, place, away, giftKey]);

  useEffect(() => {
    if (!room) return undefined;
    const g = canvasRef.current.getContext('2d');
    const still = reducedMotion();
    const frame = () => drawRoom(g, room, look, working, still ? 0 : performance.now(), entrance.current, sleeping, away);
    frame();
    const id = setInterval(frame, FRAME_MS);
    return () => clearInterval(id);
  }, [room, look, working, sleeping, away]);

  return (
    <div className="room-host" ref={hostRef} aria-hidden="true">
      {view && <canvas ref={canvasRef} width={view.LW} height={view.LH} style={{ width: view.LW * view.s, height: view.LH * view.s }} />}
    </div>
  );
}

const SIMPLE_KEY = 'agent-house-simple-chat';

export default function Home({ asleep, agent, messages, chats, chatId, chatProject, loaded, onOpenChat, onNewChat, onRenameChat, onMoveChat, onDeleteChat, onProject, live, call, onAnswer, onGift, phase, level, onLevel, onSend, onStop, onLeave, onIris, room, jobs, onRoom, onJobs }) {
  const slot = `${agent.name}|${room ?? ''}`; // the interview room keeps its own draft
  const [draft, setDraft] = useState(() => drafts.get(slot)?.draft ?? '');
  const [files, setFiles] = useState(() => drafts.get(slot)?.files ?? []);
  const [attachError, setAttachError] = useState('');
  const [levelError, setLevelError] = useState('');
  const [thanks, setThanks] = useState(false);
  const [giftError, setGiftError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [wokenUp] = useState(() => ['asleep', 'nap'].includes(routineOf(agent.name)) && !isGod(agent.name));
  const [wide] = useState(() => matchMedia('(min-width: 900px)').matches);
  // Engineer can drop the room for a plain chat, like claude.ai. The choice is remembered.
  const [simple, setSimple] = useState(() => {
    try { return isEngineer(agent.name) && localStorage.getItem(SIMPLE_KEY) === '1'; } catch { return false; }
  });
  const toggleSimple = (e) => {
    onIris(() => setSimple(!simple), e); // the island's iris, opening from the button
    try { localStorage.setItem(SIMPLE_KEY, simple ? '0' : '1'); } catch { /* it just isn't remembered */ }
  };
  // In the plain view a project's page can stand in for the chat, like on claude.ai.
  const [projectView, setProjectView] = useState(null);
  const [projectError, setProjectError] = useState('');
  const [moveError, setMoveError] = useState('');
  const projects = agent.projects ?? [];
  const openProject = simple && projects.find((p) => p.id === projectView);
  const inProject = projects.find((p) => p.id === chatProject);
  const openChat = (id) => { setProjectView(null); onOpenChat(id); };
  const newChat = (project) => { setProjectView(null); onNewChat(project); };
  const newProject = async () => {
    const made = await onProject(null, 'POST', {});
    setProjectError(made.error ?? '');
    if (!made.error) setProjectView(made.id);
  };
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
  const wakes = asleep && new Date(asleep).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  const status = live.busy ? `${live.activity ?? 'Thinking'}…` : sleeping ? `Asleep until ${wakes}` : isGod(agent.name) ? '' : sinceVisit(agent.lastVisit);
  const back = room ? (e) => onRoom(null, e) : onLeave;
  const facts = [
    agent.streak ? ['star', `${agent.streak}-day streak`] : null,
    agent.misses ? ['cloud', `${agent.misses} missed this week`] : null,
    agent.waiting ? ['letter', `${agent.waiting} ${agent.waiting === 1 ? 'note' : 'notes'} waiting`] : null,
  ].filter(Boolean);
  const uploading = files.some((f) => f.pending);
  const canSend = !live.busy && !sleeping && !uploading && Boolean(draft.trim() || files.length);
  const levelLabel = CLAUDE_LEVELS.find((l) => l.id === (level ?? defaultLevelOf(agent.name)))?.label;

  useEffect(() => {
    if (!thanks) return undefined;
    const id = setTimeout(() => setThanks(false), 4000);
    return () => clearTimeout(id);
  }, [thanks]);
  const pickGift = async (id) => {
    setGiftError('');
    const problem = await onGift(id);
    if (problem) setGiftError(problem);
    else setThanks(true);
  };

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
      setAttachError(err.message || 'Couldn\'t open the file picker.');
    }
  };

  /** Dropped or pasted files have no path a browser can see, so they're saved locally and referenced there. */
  const uploadFiles = (list) => [...list].forEach(async (file) => {
    const id = `${file.name}-${file.size}-${Math.random()}`;
    setAttachError('');
    setFiles((cur) => [...cur, { path: file.name || 'Pasted file', pending: true, id }]);
    try {
      const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name || 'pasted')}`, { method: 'POST', body: file });
      const reply = await res.json();
      if (!res.ok) throw new Error(reply.error);
      setFiles((cur) => cur.map((f) => (f.id === id ? { path: reply.path } : f)));
    } catch (err) {
      setFiles((cur) => cur.filter((f) => f.id !== id));
      setAttachError(err.message || `Couldn't attach ${file.name}.`);
    }
  });

  const hasFiles = (e) => [...e.dataTransfer.types].includes('Files');
  const blocks = [];
  messages.forEach((m, i) => {
    if (m.role === 'note' && blocks.at(-1)?.notes) blocks.at(-1).notes.push(m);
    else blocks.push(m.role === 'note' ? { notes: [m], key: i } : { message: m, key: i, index: i });
  });

  return (
    <div className={`home${simple ? ' is-simple' : ''}`}>
      {!simple && <Room look={look} working={Boolean(live.busy)} away={isJobs(agent.name) && Boolean(jobs?.busy)} gifts={agent.gifts} phase={phase} asleep={wokenUp} sleeping={sleeping} room={room} />}

      {simple ? (
        <nav className="side" aria-label={`Conversations with ${display(agent.name)}`}>
          <div className="side-signs">{/* the way back stays in the island's style */}
            <button type="button" className="btn" onClick={onLeave}>Back to the island</button>
            <button type="button" className="btn" onClick={toggleSimple}>Island view</button>
          </div>
          <button type="button" className="side-new" onClick={() => newChat()}><Glyph name="plus" />New conversation</button>
          <h2>Projects</h2>
          <ul className="chat-list">
            {projects.map((p) => (
              <li key={p.id} className={p.id === openProject?.id ? 'is-current' : undefined}>
                <button type="button" className="chat-pick" aria-current={p.id === openProject?.id ? 'page' : undefined} onClick={() => setProjectView(p.id)}><span>{p.name}</span></button>
              </li>
            ))}
          </ul>
          <button type="button" className="side-new" onClick={newProject}><Glyph name="plus" />New project</button>
          {projectError && <p className="box-error" role="alert">{projectError}</p>}
          <h2>Recents</h2>
          {chats.length === 0 && <p className="quiet">No conversations yet.</p>}
          <ChatList chats={chats} current={openProject ? null : chatId} busy={Boolean(live.busy)} onOpen={openChat} onRename={onRenameChat} onDelete={onDeleteChat} />
          <label className="level-pick">
            Claude
            <LevelSelect agent={agent.name} value={level} onChange={async (model) => setLevelError((await onLevel(model)) ?? '')} />
          </label>
        </nav>
      ) : (
        <div className="home-side">
          <button type="button" className="btn" onClick={onLeave}>Back to the island</button>
          {room && <button type="button" className="btn" onClick={(e) => onRoom(null, e)}>Go home</button>}
          {isEngineer(agent.name) && <button type="button" className="btn" onClick={toggleSimple}>Simple view</button>}
          {isJobs(agent.name) && <Office room={room} jobs={jobs} onAct={onJobs} onRoom={onRoom} />}
        </div>
      )}

      {openProject && (
        <ProjectPage
          key={openProject.id}
          project={openProject}
          chats={chats.filter((c) => c.project === openProject.id)}
          busy={Boolean(live.busy)}
          onOpen={openChat}
          onRename={onRenameChat}
          onDelete={onDeleteChat}
          onNew={() => newChat(openProject.id)}
          onSave={(body) => onProject(openProject.id, 'PATCH', body)}
          onRemove={() => onProject(openProject.id, 'DELETE')}
        />
      )}

      {!simple && (
      <div className="home-corner">{/* today's list sits on top of the name card, however tall the card gets */}
      {agent.today?.items.length > 0 && (
        <details className="pin" open={wide}>
          <summary>Today <span>{doneCount} of {agent.today.items.length}</span></summary>
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
        <div className="who-body">
          <div>
            <h2>{display(agent.name)}</h2>
            {JOB_ROOMS[room] && <span className="who-place">{JOB_ROOMS[room]}</span>}
            <p role="status">{status}</p>
          </div>
          {agent.level > 0 && (
            <div className="who-level" role="img" aria-label={`Level ${agent.level}: ${agent.points} of ${agent.nextAt} points`}>
              <b>Level {agent.level}</b>
              <span className="bar"><i style={{ width: `${Math.min(100, (agent.points / agent.nextAt) * 100)}%` }} /></span>
              <small>{agent.points}/{agent.nextAt}</small>
            </div>
          )}
          {facts.length > 0 && (
            <ul className="who-facts">
              {facts.map(([icon, text]) => <li key={text}><Icon name={icon} />{text}</li>)}
            </ul>
          )}
          <div className="who-foot">
            {isEngineer(agent.name)
              ? (
                <label className="level-pick">
                  Claude
                  <LevelSelect agent={agent.name} value={level} onChange={async (model) => setLevelError((await onLevel(model)) ?? '')} />
                </label>
              )
              : `Claude ${levelLabel}`}
          </div>
        </div>
      </aside>
      </div>
      )}

      <main
        className={`chat frame${dragging ? ' is-dragging' : ''}`}
        hidden={Boolean(openProject)} // kept, not unmounted, so the draft and scroll survive a look at the project
        aria-label={`Conversation with ${display(agent.name)}`}
        style={{ '--wall': look.wall, '--wall-ink': look.ink }}
        onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); } }}
      >
        {simple
          ? (
            <header className="chat-head">
              {inProject && <button type="button" className="crumb" onClick={() => setProjectView(inProject.id)}>{inProject.name}</button>}
              {inProject && <span aria-hidden="true">/</span>}
              <h1>{chats.find((c) => c.id === chatId)?.title ?? 'New conversation'}</h1>
              {projects.length > 0 && chats.some((c) => c.id === chatId) && ( // a chat joins the list with its first message
                <select className="move" aria-label="This conversation's project" title="Move to another project" value={inProject?.id ?? ''} onChange={async (e) => setMoveError((await onMoveChat(chatId, e.target.value || null)) ?? '')}>
                  <option value="">No project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </header>
          )
          : <ChatBar chats={chats} current={chatId} busy={Boolean(live.busy)} onOpen={onOpenChat} onNew={onNewChat} onRename={onRenameChat} onDelete={onDeleteChat} />}

        <div className="thread" key={chatId} ref={threadRef} onScroll={onScroll} role="log" aria-live="polite">
          {loaded && messages.length === 0 && !turnHere && (
            <div className="hello">
              <p><b>{display(agent.name)}</b> is waiting for you.</p>
              {room === 'interviews' && <p>Say which role you're going for and the mock interview begins.</p>}
              {room === 'port' && <p>This is where the job hunt happens: send Jobs out on the boat, or go through the board together.</p>}
              {room ? null : agent.hasPrompt ? <p>Say hello to start.</p> : <p>This folder has no CLAUDE.md yet, so it's a blank page. Tell it who to be and it can write its own.</p>}
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
          {turnHere && <p className="pending" role="status"><i /><i /><i /><span>{live.activity ?? 'Thinking'}</span></p>}
          {errorHere && (
            <div className="slip" role="alert">
              <p>{live.error}</p>
              <button type="button" onClick={() => (live.lastCall ? onAnswer(live.lastCall, live.chat) : onSend(live.lastText, live.lastFiles))}>Retry</button>
            </div>
          )}
        </div>

        {agent.unwrapped > 0 && !live.busy && (
          <div className="level-up" role="status">
            <Icon name="star" />
            <p><b>{display(agent.name)} reached level {agent.level}.</b> Pick a gift for its home:</p>
            <div className="gift-picks">
              {agent.offer.map((id) => <button type="button" className="btn" key={id} onClick={() => pickGift(id)}>{GIFTS.find((g) => g.id === id)?.label ?? id}</button>)}
            </div>
            {giftError && <p role="alert">{giftError}</p>}
          </div>
        )}
        {thanks && <div className="level-up" role="status"><Icon name="star" /><p>It loves it! It's already in its home.</p></div>}

        {call && !live.busy && !sleeping && (
          <div className="call" role="status" data-status={call.status}>
            <Icon name="phone" />
            <p><b>{call.status === 'missed' ? `Missed call from ${display(agent.name)}` : `${display(agent.name)} is calling you`}</b> {call.why}</p>
            <button type="button" className="btn" onClick={() => onAnswer(call)}>{call.status === 'missed' ? 'Call back' : 'Answer'}</button>
          </div>
        )}

        {!atBottom && <button type="button" className="btn to-bottom" aria-label="Go to the latest message" onClick={() => { stick.current = true; setAtBottom(true); toBottom(); }}><Glyph name="down" /></button>}

        {agent.quick.length > 0 && messages.length === 0 && !room && (
          <div className="quick">
            {agent.quick.map((q) => <button type="button" key={q} disabled={live.busy} onClick={() => submit(`Let's do the ${q} protocol.`, [])}>{q[0].toUpperCase() + q.slice(1)}</button>)}
          </div>
        )}
        <form className="box" onSubmit={(e) => { e.preventDefault(); submit(draft); }}>
          {files.length > 0 && (
            <ul className="atts">
              {files.map((f) => <Attachment key={f.id ?? f.path} path={f.path} pending={f.pending} onRemove={f.pending ? undefined : () => setFiles((cur) => cur.filter((x) => x !== f))} />)}
            </ul>
          )}
          <div className="box-row">
            <button type="button" className="btn attach" aria-label="Attach files from your computer" title="Attach files" onClick={pickFiles}><Glyph name="plus" /></button>
            <label className="sr-only" htmlFor="draft">Message for {display(agent.name)}</label>
            <textarea
              id="draft"
              rows={1}
              maxLength={20000}
              value={draft}
              autoFocus
              placeholder={sleeping ? `${display(agent.name)} is asleep: your Claude limit is at 100%. Wakes up at ${wakes}.` : live.busy && !turnHere ? `${display(agent.name)} is still in another conversation` : `Say something to ${display(agent.name)}`}
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
              ? <button type="button" className="btn btn-stop send" onClick={onStop}>Stop</button>
              : <button type="submit" className="btn send" disabled={!canSend}>Send</button>}
          </div>
          {(attachError || levelError || moveError) && <p className="box-error" role="alert">{attachError || levelError || moveError}</p>}
        </form>
        {dragging && <div className="drop-hint" aria-hidden="true">Drop the files to attach them</div>}
      </main>
    </div>
  );
}
