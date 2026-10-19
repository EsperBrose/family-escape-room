# Family Escape Room — Plan

A co-op escape room game for 2–20 players (ages 6+), each on their own device.
Every player's screen shows different clues, so nobody can solve a puzzle alone —
you have to talk to each other. Players can be in the same room or remote.

## Design
- **Website** that works on any phone, tablet or computer (no install; add-to-home-screen supported).
- **Rooms:** one player creates a room and gets a 4-letter code; everyone else joins with it.
- **Theme vote:** the lobby shows theme cards, everyone votes, the winner is played.
- **Split clues:** each puzzle's clues are divided among however many players there are (2–20).
  Big groups (10+) are split into teams working on different puzzles at once.
- **Ages 6+:** picture/color/shape/counting puzzles, a 🔊 read-aloud button on every clue,
  and a mix of easy and harder puzzles.
- **Remote play:** in-game chat + emoji pings, plus a built-in video call (video for up to ~8
  players, voice-only for bigger groups so phones don't overload).
- **~30 minutes:** shared countdown timer, ~5 puzzles per theme, hints.

## Tech
- Static site hosted on **GitHub Pages**, deployed by **GitHub Actions**.
- **Firebase Realtime Database** (free tier) keeps all devices in sync.
- Puzzles and themes are data files, so new themes don't need engine changes.

## Phase 1 — Foundation
- [x] 1.1 Repo, PLAN.md, starter site that auto-deploys to a public link — https://esperbrose.github.io/family-escape-room/
- [ ] 1.2 Firebase connected: create/join a room with a code, live lobby showing who's in
- [ ] 1.3 Reconnect when a phone sleeps or loses Wi-Fi; host controls (start, kick)

## Phase 2 — Game engine
- [ ] 2.1 Game flow (lobby → vote → play → win/lose) with a shared timer
- [ ] 2.2 Split each puzzle's clues across 2–20 players; team mode for big groups
- [ ] 2.3 Answer entry, shared progress bar, hints

## Phase 3 — First theme: Haunted Mansion 👻
- [ ] 3.1 Two picture/color puzzles (little-kid friendly)
- [ ] 3.2 Three more puzzles incl. harder ones; win and lose screens
- [ ] 3.3 Read-aloud button and sound effects

## Phase 4 — Remote play
- [ ] 4.1 In-game chat and emoji pings
- [ ] 4.2 Built-in voice call (WebRTC, Firebase for signaling) with mute button
- [ ] 4.3 Built-in video call: camera tiles for up to ~8 players, voice-only fallback for bigger groups

## Phase 5 — More themes + voting
- [ ] 5.1 Theme voting screen
- [ ] 5.2 Space Station 🚀
- [ ] 5.3 Pirate Treasure 🏴‍☠️ and Secret Agent Lab 🕵️

## Phase 6 — Polish
- [ ] 6.1 Test on iPhone, Android, iPad and desktop browsers; fix layout issues
- [ ] 6.2 Add-to-home-screen support and accessibility (big tap targets, color-blind-friendly clues)
