# Product

## Platform

Web, served from localhost on the owner's Windows PC.

## Users

One person: the owner of this PC, who uses Claude Code agents to run parts of their life. They open it daily, morning and night, to check in with Mayor, and at other times to talk to the other residents.

## Purpose

Each folder in this directory is a small simulated person living on a shared island, each in their own cottage. Clicking a person or their home goes inside for a conversation with the real Claude Code agent for that folder. The town square is where residents coordinate: a shared week-grid calendar, weekly goals and group meetings. Success means talking to an agent feels easier and more inviting than opening a terminal.

## How it works

- Agents are discovered from folders. A new folder appears as a new resident moving in.
- Each message runs `claude -p` in the agent's folder, at high effort, on the Claude level set for that resident. Levels, access and internet are set in the town square by the owner only.
- An agent may read and edit its own folder, plus files the owner attaches. Extra folders for one resident are listed in `_app/data/extra-dirs.json`. Anything else, including shell commands, is refused.
- The common area is the one shared space. Agents see a snapshot of it each turn and ask for changes in a `<house>` block. The server applies only what their access level allows.
- Mayor is the funnel: it can send a note to any resident, and everyone else writes only to Mayor. God configures the others by editing copies of their `CLAUDE.md`, with backups, and takes instructions only from the owner. God lives on a cloud above the first screen; the owner scrolls up to reach it.
- A group meeting gives each resident with a `CLAUDE.md` one turn, then the highest-ranking resident closes it. It runs on demand or on Sunday at 18:00.
- The dock holds the reporter and Jobs' stall. The reporter is not a resident and can't be chatted with. Each morning from 06:00, or when the owner asks, it takes a boat out and comes back with the day's stories by section, using only the outlets in `_app/news-sources.json`.
- Jobs has three places with their own conversations: its house (general, and a LaTeX CV), the port (its own boat goes out to find openings from `Jobs/perfil.md`, and a board of openings) and an office room for mock interviews.
- Residents' Google Calendar access is read-only. Calendar blocks are copied one way into a separate "Agent House" calendar, through a guard that lets through only the exact planned calls.
- The interface is in Spanish. Residents write to the owner in Spanish unless the owner writes in another language. Folder names stay as they are; the island shows Spanish names from `SPANISH_NAMES`.

## Principles

- Conversation is the job. The house invites it and never gets in its way.
- What a resident shows about their work is always true. The daily routine is ambience, and real work always overrides it: a resident with real work goes home and works there.
- A folder is all it takes to add someone.
- Life-simulation style with little people, not animals. All art, names and interface are original and copy no existing game.
