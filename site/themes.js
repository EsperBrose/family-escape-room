// Theme and puzzle data. Adding a theme means adding an entry here; the engine
// in game.js doesn't need to change.
//
// Puzzle fields:
//   prompt  - shown to everyone working on the puzzle
//   input   - how the answer is entered:
//             { type: 'sequence', options: [emoji], length }   tap emoji in order
//             { type: 'code', keys: 'digits' | 'letters', length }   keypad
//             { type: 'choice', options: [{ id, emoji, label }] }   tap one
//   answer  - array (sequence), string (code) or option id (choice)
//   clues   - split between players; each has a big picture and a short sentence
//   hints   - revealed one at a time when the team asks; the last one gives the answer

window.THEMES = [
  {
    id: 'practice',
    name: 'Practice Room',
    emoji: '🧩',
    available: true,
    durationMin: 10,
    intro: 'Four quick locks stand between you and the exit. Share your clues to open them!',
    winText: 'The door swings open. You escaped the Practice Room!',
    loseText: 'The clock ran out, but you can try again!',
    puzzles: [
      {
        id: 'colors',
        title: 'The Color Lock',
        emoji: '🚪',
        prompt: 'The door has a lock with colored buttons. Press 3 colors in the right order.',
        input: { type: 'sequence', options: ['🔴', '🟡', '🟢', '🔵'], length: 3 },
        answer: ['🔴', '🟢', '🔵'],
        clues: [
          { big: '🔴 = 1️⃣', text: 'Red goes FIRST.' },
          { big: '🟢 = 2️⃣', text: 'Green goes in the MIDDLE.' },
          { big: '🔵 = 3️⃣', text: 'Blue goes LAST.' },
          { big: '🚫 🟡', text: "Yellow is a trick! Don't press it." },
        ],
        hints: [
          'Everyone has a different color clue. Say yours out loud!',
          'The order is 🔴 🟢 🔵.',
        ],
      },
      {
        id: 'legs',
        title: 'The Animal Lock',
        emoji: '🐾',
        prompt: 'This lock wants a number: how many legs are in the room? Each of you sees different animals. Add them all up!',
        input: { type: 'code', keys: 'digits', length: 2 },
        answer: '18',
        clues: [
          { big: '🐶 🐶', text: 'You see 2 dogs. Each dog has 4 legs.' },
          { big: '🐔', text: 'You see 1 chicken. A chicken has 2 legs.' },
          { big: '🕷️', text: 'You see 1 spider. A spider has 8 legs!' },
        ],
        hints: [
          'The two dogs have 4 + 4 = 8 legs.',
          'Dogs 8 + chicken 2 + spider 8 = 18.',
        ],
      },
      {
        id: 'word',
        title: 'The Secret Word',
        emoji: '🔤',
        prompt: 'Type the 3-letter password. Each of you knows one letter.',
        input: { type: 'code', keys: 'letters', length: 3 },
        answer: 'KEY',
        clues: [
          { big: '1️⃣ = K', text: 'The FIRST letter is K.' },
          { big: '2️⃣ = E', text: 'The SECOND letter is E.' },
          { big: '3️⃣ = Y', text: 'The THIRD letter is Y.' },
        ],
        hints: [
          'Put the letters in number order: 1, 2, 3.',
          'The password is KEY.',
        ],
      },
      {
        id: 'pick',
        title: 'The Last Door',
        emoji: '🗝️',
        prompt: 'Only one of these things opens the last door. Which one?',
        input: {
          type: 'choice',
          options: [
            { id: 'gold', emoji: '🔑', label: 'Shiny gold key' },
            { id: 'old', emoji: '🗝️', label: 'Old key' },
            { id: 'ticket', emoji: '🎫', label: 'Ticket' },
            { id: 'magnet', emoji: '🧲', label: 'Magnet' },
          ],
        },
        answer: 'old',
        clues: [
          { big: '🚫 🔑', text: "It's NOT the shiny gold key." },
          { big: '🚫 🎫', text: "It's NOT the ticket." },
          { big: '🚫 🧲', text: "A magnet can't open this door." },
        ],
        hints: [
          'Cross out everything your clues say NO to.',
          'It is the old key 🗝️.',
        ],
      },
    ],
  },
  { id: 'haunted', name: 'Haunted Mansion', emoji: '👻', available: false },
  { id: 'space', name: 'Space Station', emoji: '🚀', available: false },
  { id: 'pirate', name: 'Pirate Treasure', emoji: '🏴‍☠️', available: false },
  { id: 'agent', name: 'Secret Agent Lab', emoji: '🕵️', available: false },
];
