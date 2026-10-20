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
- **PeerJS** (free public broker, no accounts or API keys) connects devices with WebRTC.
  The room creator's device is the host: it holds the game state and relays it to everyone.
  The host must keep the game open. If strict networks or host dropouts become a problem,
  move state to a hosted backend such as Firebase.
- WebRTC is also used for the built-in voice/video call.
- **Safety:** no accounts and nothing stored on a server; game data and calls go directly
  device-to-device, encrypted. Only people with the room code can join, and the host can
  lock the room and remove players (1.3).
- Puzzles and themes are data files, so new themes don't need engine changes.

## Phase 1 — Foundation
- [x] 1.1 Repo, PLAN.md, starter site that auto-deploys to a public link — https://esperbrose.github.io/family-escape-room/
- [x] 1.2 Create/join a room with a code (PeerJS), live lobby showing who's in
- [x] 1.3 Reconnect when a phone sleeps or loses Wi-Fi; host controls (start, remove player, lock room)

## Phase 2 — Game engine
- [x] 2.1 Game flow (lobby → theme vote → play → win/lose), shared timer, answer entry
      (tap-sequence, keypad, pick-one), with a 4-puzzle Practice Room theme
- [ ] 2.2 Split each puzzle's clues across 2–20 players; team mode for big groups
- [ ] 2.3 Shared progress bar, hints (1-minute penalty), right/wrong feedback for the team

## Phase 3 — First theme: Haunted Mansion 👻
- [ ] 3.1 Two picture/color puzzles (little-kid friendly)
- [ ] 3.2 Three more puzzles incl. harder ones; win and lose screens
- [ ] 3.3 Read-aloud button and sound effects

## Phase 4 — Remote play
- [ ] 4.1 In-game chat and emoji pings
- [ ] 4.2 Built-in voice call (WebRTC via PeerJS) with mute button
- [ ] 4.3 Built-in video call: camera tiles for up to ~8 players, voice-only fallback for bigger groups

## Phase 5 — More themes + voting
- [ ] 5.1 Theme voting screen polish (art and descriptions; basic voting shipped in 2.1)
- [ ] 5.2 Space Station 🚀
- [ ] 5.3 Pirate Treasure 🏴‍☠️ and Secret Agent Lab 🕵️

## Phase 6 — Polish
- [ ] 6.1 Test on iPhone, Android, iPad and desktop browsers; fix layout issues
- [ ] 6.2 Add-to-home-screen support and accessibility (big tap targets, color-blind-friendly clues)
