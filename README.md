# Cheeky Pete

A neon, pixel-art rhythm-typing game. Letters fall down the lanes and you hit the
matching key just as each tile reaches the glowing **HIT ZONE**. Pete cheers you on
(and heckles you when you miss).

No installs, no build step: it's just `index.html`, `style.css`, `game.js` and an
`assets` folder.

## How to play

- **Open `index.html`** in a browser (double-click it), or put the folder on GitHub Pages
  or any static host.
- Press **Space** (or tap **START**) to begin.
- Each lane has a letter, shown on the box at the bottom of the lane. When a tile
  crosses that box, press its letter key.
  - Spot on = **PERFECT** (100 pts), a little off = **GOOD** (50 pts).
  - Every 10 hits in a row raises your score multiplier (up to ×4).
- A **wrong key**, or a tile that slips past, is a **MISS**: your combo resets and
  you lose a heart. Lose all 5 hearts and it's game over.
- **Levels:** hit the number of tiles shown by the bar under the title to clear a
  level. You get a LEVEL UP bonus, a heart back, new letters, and it all gets faster.
- **P** or **Esc** pauses. **M** mutes the sound.
- **Phones/tablets:** big letter buttons appear under each lane. Just tap them.
- Your best score is saved in the browser.

## Changing Pete's catchphrases

Open `game.js`. Near the top there's a clearly labelled block called
**`CATCHPHRASES`**:

```js
const CATCHPHRASES = {
  good: [
    { text: 'I got it Chat',    audio: 'assets/audio/i-got-it-chat.mp3' },
    { text: 'I Love You Chat!', audio: 'assets/audio/i-love-you-chat.mp3' },
    { text: 'Easy!',            audio: 'assets/audio/easy.mp3' },
  ],
  miss: [
    { text: 'Boo!',      audio: 'assets/audio/boo.mp3' },
    { text: 'Help Chat', audio: 'assets/audio/help-chat.mp3' },
    { text: 'Too Fast',  audio: 'assets/audio/too-fast.mp3' },
  ],
};
```

- `good` lines show on combo milestones, on level ups, and now and then on good hits.
- `miss` lines show when you miss.
- To change a line, edit the `text`. To add one, copy a line and change it. Pete
  never says the same line twice in a row.

## Adding the audio clips

Save each clip in `assets/audio/` with the file name shown in the list above
(for example `assets/audio/i-got-it-chat.mp3`). That's it: the clip plays when Pete
says that line. Any clip that isn't there yet is simply skipped.
(Browser dev tools will show a harmless "404 not found" note for missing clips.)

You can use any name or format browsers play (`.mp3`, `.ogg`, `.wav`, `.m4a`); just
make the `audio:` path match. Use `audio: null` for a line with no sound.

## Other tweaks

The `CONFIG` block just below the catchphrases in `game.js` holds the number of
lanes (3 or 4), lives, timing windows, points, and how each level's target, speed
and spawn rate are worked out.

## Developer bits (optional)

- `tools/make_sprite.py` rebuilds `assets/pete.png` and `assets/pete-cheer.png` from the
  original black-background art (needs Python + Pillow). It removes the black
  background and lines the two poses up so the swap looks clean.
- `tools/test_game.py` is an automated browser test (needs Python + Playwright with
  Chromium). It plays the game on desktop and phone sizes and saves screenshots.
