import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import './style.css';
import Island from './Island.jsx';
import Home from './Home.jsx';
import Common from './Common.jsx';
import { COMMON, phaseOf } from './news.js';
import { shown } from './layout.js';

const api = (name, action) => `/api/agents/${encodeURIComponent(name)}/${action}`;
const placeFromUrl = () => decodeURIComponent(location.hash.slice(1)) || null;

/** Two short notes, so a call is heard even when the island isn't in front. */
function ringTone() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.2;
      osc.type = 'square';
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.04, at);
      gain.gain.setValueAtTime(0, at + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.16);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* no audio, the bubble still rings */ }
}

function App() {
  const [agents, setAgents] = useState(null);
  const [house, setHouse] = useState(null);
  const [offline, setOffline] = useState(false);
  const [place, setPlace] = useState(placeFromUrl); // null is the island, otherwise a resident's name or COMMON
  const [room, setRoom] = useState(null); // inside a home: null is the home itself; Jobs also has 'port' and 'interviews'
  const [threads, setThreads] = useState({}); // messages by conversation id
  const [chats, setChats] = useState({}); // each resident's list, newest first
  const [openChats, setOpenChats] = useState({}); // the conversation showing in each home
  const [live, setLive] = useState({});
  const [now, setNow] = useState(() => new Date());
  const controllers = useRef({});
  const placeRef = useRef(place);
  placeRef.current = place;
  const openChatsRef = useRef(openChats);
  openChatsRef.current = openChats;
  const slotOf = (name, inRoom = room) => (inRoom ? `${name}|${inRoom}` : name); // each room remembers its own open conversation

  const refresh = useCallback(async () => {
    try {
      const [people, common] = await Promise.all([fetch('/api/agents'), fetch('/api/house')]);
      if (!people.ok || !common.ok) throw new Error();
      const [peopleData, commonData] = await Promise.all([people.json(), common.json()]);
      setAgents(peopleData);
      setHouse(commonData);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 3000);
    const clock = setInterval(() => setNow(new Date()), 30000);
    const onBack = () => {
      setPlace(placeFromUrl());
      setRoom(null);
    };
    window.addEventListener('popstate', onBack);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      window.removeEventListener('popstate', onBack);
    };
  }, [refresh]);

  const loadChats = useCallback(async (name) => {
    const list = await (await fetch(api(name, 'chats'))).json();
    setChats((c) => ({ ...c, [name]: list }));
    return list;
  }, []);

  const newIn = useRef({}); // a new conversation started inside a project, until its first message files it there
  const startChat = useCallback((name, project) => {
    const id = crypto.randomUUID(); // it only reaches the server, and the list, with its first message
    if (project) newIn.current[id] = project;
    setThreads((t) => ({ ...t, [id]: [] }));
    setOpenChats((o) => ({ ...o, [name]: id }));
  }, []);

  // Walking in shows the conversation you were in, or the latest one held in this room.
  useEffect(() => {
    if (!place || place === COMMON) return;
    const slot = room ? `${place}|${room}` : place;
    loadChats(place)
      .then((list) => {
        if (openChatsRef.current[slot]) return;
        const latest = list.find((c) => (c.room ?? null) === room);
        if (latest) setOpenChats((o) => ({ ...o, [slot]: latest.id }));
        else startChat(slot);
      })
      .catch(() => setOffline(true));
  }, [place, room, loadChats, startChat]);

  const openId = place && openChats[slotOf(place)];
  useEffect(() => {
    if (!openId || threads[openId]) return;
    fetch(`${api(place, 'chats')}/${openId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((messages) => setThreads((t) => ({ ...t, [openId]: t[openId] ?? messages })))
      .catch(() => setOffline(true));
  }, [place, openId, threads]);

  const patchLive = (name, patch) => setLive((l) => ({ ...l, [name]: { ...l[name], ...patch } }));
  const append = (chat, message) => setThreads((t) => ({ ...t, [chat]: [...(t[chat] ?? []), { at: Date.now(), ...message }] }));

  /** Runs a change of scene through an iris centred on what was clicked. */
  const iris = useCallback((apply, event) => {
    const root = document.documentElement.style;
    root.setProperty('--ix', `${event?.clientX || innerWidth / 2}px`);
    root.setProperty('--iy', `${event?.clientY || innerHeight / 2}px`);
    if (!document.startViewTransition || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
    document.startViewTransition(() => flushSync(apply));
    return undefined;
  }, []);
  const go = useCallback((next, event, inRoom = null) => iris(() => {
    setPlace(next);
    setRoom(inRoom);
    if (next && next !== COMMON) setLive((l) => ({ ...l, [next]: { ...l[next], unread: false } }));
    history.pushState(null, '', next ? `#${encodeURIComponent(next)}` : location.pathname);
  }, event), [iris]);
  const goRoom = useCallback((next, event) => iris(() => setRoom(next), event), [iris]);
  const leave = useCallback((event) => go(null, event), [go]);

  // `call` is a call being picked up: the resident speaks first, so there is no message from the owner.
  const send = async (name, text, files = [], { call, chat: opened } = {}) => {
    const controller = new AbortController();
    controllers.current[name] = controller;
    const chat = opened ?? openChats[slotOf(name)];
    if (!call) append(chat, { role: 'user', text, files });
    patchLive(name, { busy: true, chat, activity: 'Thinking', error: null, lastText: text, lastFiles: files, lastCall: call });

    const handle = (event) => {
      if (event.type === 'activity') patchLive(name, { activity: event.label });
      if (event.type === 'attached') {
        setThreads((t) => {
          const list = [...t[chat]];
          const last = list.findLastIndex((m) => m.role === 'user');
          list[last] = { ...list[last], files: event.files };
          return { ...t, [chat]: list };
        });
      }
      if (event.type === 'text') {
        append(chat, { role: 'agent', text: event.text });
        patchLive(name, { activity: 'Thinking', unread: placeRef.current !== name });
      }
      if (event.type === 'note') append(chat, { role: 'note', text: event.text });
      if (event.type === 'error') patchLive(name, { error: event.message });
    };

    try {
      const res = await fetch(api(name, 'chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, files, chat, room, call: call?.id, project: newIn.current[chat] }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      loadChats(name); // the server has it by now, so a new conversation joins the list
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.filter(Boolean).forEach((line) => handle(JSON.parse(line)));
      }
    } catch (err) {
      if (err.name !== 'AbortError') patchLive(name, { error: err.message || 'The local server stopped responding.' });
    } finally {
      patchLive(name, { busy: false, activity: null });
      refresh();
    }
  };

  const stop = (name) => controllers.current[name]?.abort();

  /** The owner unwraps a level-up. Returns an error message, or null. */
  const giveGift = async (name, gift) => {
    try {
      const res = await fetch(api(name, 'gift'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gift }) });
      if (!res.ok) return (await res.json()).error;
      const updated = await res.json();
      setAgents((list) => list.map((a) => (a.name === name ? { ...a, ...updated } : a)));
      return null;
    } catch {
      return 'The local server stopped responding.';
    }
  };

  /** Picking up a call opens a fresh conversation (or the one that failed, when retrying) and the resident starts. */
  const answer = (name, call, retry) => {
    const chat = retry ?? crypto.randomUUID();
    if (!retry) {
      const note = call.status === 'missed' ? `You returned ${shown(name)}'s missed call` : `You answered ${shown(name)}'s call`;
      setThreads((t) => ({ ...t, [chat]: [{ at: Date.now(), role: 'note', text: note }] }));
      setOpenChats((o) => ({ ...o, [slotOf(name)]: chat }));
    }
    setHouse((h) => h && { ...h, calls: h.calls.filter((c) => c.id !== call.id) });
    send(name, '', [], { call, chat });
  };

  // A call that starts ringing is heard once. A missed one never rings again.
  const heard = useRef(new Set());
  useEffect(() => {
    for (const call of house?.calls ?? []) {
      if (call.status !== 'ringing' || heard.current.has(call.id)) continue;
      heard.current.add(call.id);
      ringTone();
      if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') new Notification(`${shown(call.agent)} is calling you`, { body: call.why });
    }
  }, [house?.calls]);

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'default') return undefined;
    const ask = () => Notification.requestPermission();
    window.addEventListener('pointerdown', ask, { once: true });
    return () => window.removeEventListener('pointerdown', ask);
  }, []);

  // Returns the fresh list, or an error message for the list to show.
  const changeChat = async (name, id, init) => {
    try {
      const res = await fetch(`${api(name, 'chats')}/${id}`, init);
      if (!res.ok) return (await res.json()).error;
      return await loadChats(name);
    } catch {
      return 'The local server stopped responding.';
    }
  };
  // A rename ({ title }) or a move to another project ({ project }, null for none). Returns an error message or null.
  const patchChat = async (name, id, body) => {
    const result = await changeChat(name, id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return typeof result === 'string' ? result : null;
  };
  const deleteChat = async (name, id) => {
    const result = await changeChat(name, id, { method: 'DELETE' });
    if (typeof result === 'string') return result;
    if (openChats[slotOf(name)] === id) {
      const next = result.find((c) => (c.room ?? null) === room);
      if (next) setOpenChats((o) => ({ ...o, [slotOf(name)]: next.id }));
      else startChat(slotOf(name));
    }
    return null;
  };

  // Creates (no id), edits or deletes a project. Returns { error } or the saved project.
  const changeProject = async (name, id, method, body) => {
    try {
      const res = await fetch(`${api(name, 'projects')}${id ? `/${id}` : ''}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
      const reply = await res.json();
      if (res.ok) await Promise.all([refresh(), loadChats(name)]);
      return res.ok ? reply : { error: reply.error };
    } catch {
      return { error: 'The local server stopped responding.' };
    }
  };

  // Both return an error message for the form to show, or null when it worked.
  const postHouse = async (path, body) => {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const reply = await res.json();
      if (!res.ok) return reply.error;
      setHouse(reply);
      return null;
    } catch {
      return 'The local server stopped responding.';
    }
  };
  const act = (op) => postHouse('/api/house', op);
  const callMeeting = (action) => postHouse('/api/meeting', { action });
  const moreNews = () => postHouse('/api/news', {});
  const jobsAct = (body) => postHouse('/api/jobs', body);

  // A resident being talked to is as busy as one you're talking to.
  const liveNow = useMemo(() => {
    const merged = { ...live };
    for (const { from, to } of house?.talks ?? []) merged[to] = { ...merged[to], busy: true, activity: `Talking to ${shown(from)}` };
    return merged;
  }, [live, house?.talks]);

  const current = agents?.find((a) => a.name === place);
  const phase = phaseOf(now.getHours());

  return (
    <div className="app" data-phase={phase}>
      <Island agents={agents} live={liveNow} house={house} active={!current} now={now} phase={phase} onGo={go} onMoreNews={moreNews} />
      {place === COMMON && house && <Common agents={agents ?? []} house={house} onAct={act} onMeeting={callMeeting} onLeave={leave} />}
      {current && (
        <Home
          key={slotOf(current.name)}
          agent={current}
          asleep={house?.asleep}
          room={room}
          jobs={house?.jobs}
          onRoom={goRoom}
          onJobs={jobsAct}
          messages={threads[openChats[slotOf(current.name)]] ?? []}
          chats={(chats[current.name] ?? []).filter((c) => (c.room ?? null) === room)}
          chatId={openChats[slotOf(current.name)]}
          loaded={Boolean(threads[openChats[slotOf(current.name)]])}
          onOpenChat={(id) => setOpenChats((o) => ({ ...o, [slotOf(current.name)]: id }))}
          onNewChat={(project) => startChat(slotOf(current.name), project)}
          chatProject={(chats[current.name] ?? []).find((c) => c.id === openChats[slotOf(current.name)])?.project ?? newIn.current[openChats[slotOf(current.name)]] ?? null}
          onProject={(id, method, body) => changeProject(current.name, id, method, body)}
          onRenameChat={(id, title) => patchChat(current.name, id, { title })}
          onMoveChat={(id, project) => patchChat(current.name, id, { project })}
          onDeleteChat={(id) => deleteChat(current.name, id)}
          live={liveNow[current.name] ?? {}}
          call={house?.calls?.find((c) => c.agent === current.name)}
          onAnswer={(call, chat) => answer(current.name, call, chat)}
          onGift={(gift) => giveGift(current.name, gift)}
          phase={phase}
          level={house?.models?.[current.name]}
          onLevel={(model) => act({ do: 'model', agent: current.name, model })}
          onSend={(text, files) => send(current.name, text, files)}
          onStop={() => stop(current.name)}
          onLeave={leave}
          onIris={iris}
        />
      )}
      {offline && <p className="offline" role="alert">The island lost its connection. Run Open Agent House.bat again and reload the page.</p>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
