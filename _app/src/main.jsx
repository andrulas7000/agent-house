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

function App() {
  const [agents, setAgents] = useState(null);
  const [house, setHouse] = useState(null);
  const [offline, setOffline] = useState(false);
  const [place, setPlace] = useState(placeFromUrl); // null is the island, otherwise a resident's name or COMMON
  const [room, setRoom] = useState(null); // inside a home: null is the home itself; Jobs also has 'puerto' and 'entrevistas'
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

  const startChat = useCallback((name) => {
    const id = crypto.randomUUID(); // it only reaches the server, and the list, with its first message
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

  const send = async (name, text, files = []) => {
    const controller = new AbortController();
    controllers.current[name] = controller;
    const chat = openChats[slotOf(name)];
    append(chat, { role: 'user', text, files });
    patchLive(name, { busy: true, chat, activity: 'Pensando', error: null, lastText: text, lastFiles: files });

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
        patchLive(name, { activity: 'Pensando', unread: placeRef.current !== name });
      }
      if (event.type === 'note') append(chat, { role: 'note', text: event.text });
      if (event.type === 'error') patchLive(name, { error: event.message });
    };

    try {
      const res = await fetch(api(name, 'chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, files, chat, room }),
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
      if (err.name !== 'AbortError') patchLive(name, { error: err.message || 'El servidor local dejó de responder.' });
    } finally {
      patchLive(name, { busy: false, activity: null });
      refresh();
    }
  };

  const stop = (name) => controllers.current[name]?.abort();

  // Returns the fresh list, or an error message for the list to show.
  const changeChat = async (name, id, init) => {
    try {
      const res = await fetch(`${api(name, 'chats')}/${id}`, init);
      if (!res.ok) return (await res.json()).error;
      return await loadChats(name);
    } catch {
      return 'El servidor local dejó de responder.';
    }
  };
  const renameChat = async (name, id, title) => {
    const result = await changeChat(name, id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
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

  // Both return an error message for the form to show, or null when it worked.
  const postHouse = async (path, body) => {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const reply = await res.json();
      if (!res.ok) return reply.error;
      setHouse(reply);
      return null;
    } catch {
      return 'El servidor local dejó de responder.';
    }
  };
  const act = (op) => postHouse('/api/house', op);
  const callMeeting = (action) => postHouse('/api/meeting', { action });
  const moreNews = () => postHouse('/api/news', {});
  const jobsAct = (body) => postHouse('/api/jobs', body);

  // A resident being talked to is as busy as one you're talking to.
  const liveNow = useMemo(() => {
    const merged = { ...live };
    for (const { from, to } of house?.talks ?? []) merged[to] = { ...merged[to], busy: true, activity: `Hablando con ${shown(from)}` };
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
          onNewChat={() => startChat(slotOf(current.name))}
          onRenameChat={(id, title) => renameChat(current.name, id, title)}
          onDeleteChat={(id) => deleteChat(current.name, id)}
          live={liveNow[current.name] ?? {}}
          phase={phase}
          level={house?.models?.[current.name]}
          onLevel={(model) => act({ do: 'model', agent: current.name, model })}
          onSend={(text, files) => send(current.name, text, files)}
          onStop={() => stop(current.name)}
          onLeave={leave}
        />
      )}
      {offline && <p className="offline" role="alert">La isla perdió la conexión. Abre de nuevo Open Agent House.bat y recarga la página.</p>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
