/* =========================================================================
   CHEEKY PETE - a neon rhythm-typing game
   Plain JavaScript, no dependencies. Open index.html to play.
   ========================================================================= */
(function () {
  'use strict';

  /* =======================================================================
     CATCHPHRASES  <-- edit this list to change what Pete says.
     -----------------------------------------------------------------------
     good  : said on combo milestones, level ups and (sometimes) good hits
     miss  : said when you miss a tile, press the wrong key or hit a bomb
     fever : said when FEVER mode kicks in
     Each entry: { text: 'What Pete says', audio: 'path/to/clip.mp3' }
     'audio' is optional. If the file exists it plays with the bubble; if it
     is missing (or audio is null) the game just skips it, no problem.
     ======================================================================= */
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
    fever: [
      { text: 'FEVER TIME!',        audio: 'assets/audio/fever-time.mp3' },
      { text: "Chat, I'm on fire!", audio: 'assets/audio/im-on-fire.mp3' },
    ],
  };

  /* =======================================================================
     CHAT  <-- the fake stream chat in the corner. Edit freely.
     ======================================================================= */
  const CHAT = {
    names: ['xXSniperXx', 'pixelpanda', 'bigtoast', 'neonnugget', 'lazy_lemon', 'captnclutch',
      'ginger_army', 'moddy_mo', 'keyboard_kat', 'sk8erboi', 'turbo_gran', 'noodle_lord', 'beans4life'],
    hello:  ['hi pete', 'first', 'hello chat', 'lurking', 'lets gooo', 'vibes', 'o7'],
    good:   ['W', 'POG', 'clean', 'PETE COOKING', 'EZ', 'goated', 'cracked', 'hes so back', 'nice'],
    miss:   ['L', 'skill issue', 'LUL', 'F', 'unlucky', 'bro...', 'nooo', 'KEKW', 'lag?'],
    fever:  ['FEVER!!!', 'HYPE HYPE', 'ON FIRE', 'PETE PETE PETE', 'W W W W'],
    level:  ['GG', 'next level!', 'clip it', 'actual pro', 'too easy'],
    bomb:   ['BOOM', 'he pressed it', 'why the bomb', 'KABOOM', 'LMAO'],
    heart:  ['+1 life!', 'heal up', 'nice save'],
    over:   ['GG', 'F', 'one more?', 'rematch', 'good stream'],
  };

  /* ---------------- Game tuning ---------------- */
  const CONFIG = {
    lanes: 3,                     // lanes at the start (3 or 4)
    fourthLaneLevel: 4,           // a 4th lane joins at this level (set 0 to never)
    laneColors: ['#ff2bd6', '#22d3ff', '#39ff6a', '#ffe14a'],
    firstLetters: ['A', 'J', 'K', 'L'],
    easyLetters: 'ASDFGHJKL',     // letters used in the early levels
    allLetters: 'ASDFGHJKLQWERTUIOZXCVBN', // never P or M (pause / mute)
    lives: 5,
    hitP: 0.80,                   // where the hit line sits (0 = top, 1 = bottom)
    perfectWindow: 0.065,         // seconds either side of the line
    goodWindow: 0.15,
    points: { PERFECT: 100, GOOD: 50 },
    levelBonus: 250,              // x level number, when you clear a level
    // Level n asks you to hit this many tiles:
    levelTarget: (n) => 12 + 4 * (n - 1),
    // Fall speed (screen heights per second) and gap between tiles (seconds)
    levelSpeed: (n) => Math.min(1.05, 0.36 + 0.07 * (n - 1)),
    levelSpawn: (n) => Math.max(0.30, 0.95 * Math.pow(0.88, n - 1)),
    rampPerSecond: 0.004,         // small extra speed-up while a level goes on
    levelUpPause: 2.6,            // seconds of "LEVEL UP!" before tiles return
    bubbleTime: 1.6,              // seconds a speech bubble stays up
    goodBubbleChance: 0.12,       // chance of a bubble on an ordinary good hit
    comboMilestones: [10, 25, 50, 75, 100],
    // Special tiles: chance per tile, from the given level on
    special: {
      gold:  { from: 2, chance: 0.07 },   // x3 points + lots of fever
      heart: { from: 3, chance: 0.05 },   // hit it to get a life back
      bomb:  { from: 4, chance: 0.08 },   // DON'T press it, let it fall past
    },
    goldMult: 3,
    // FEVER: fill the meter with good hits, then score x2 for a while
    feverGain: { PERFECT: 0.06, GOOD: 0.03, gold: 0.2 },
    feverTime: 8,
    shadesCombo: 25,              // Pete puts his shades on at this combo
    bestKey: 'cheekyPete.best',
  };

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const canvas = $('lanes');
  const ctx = canvas.getContext('2d');
  const el = {
    score: $('score'), combo: $('combo'), lives: $('lives'), level: $('level'),
    levelFill: $('levelFill'), feverBar: $('feverBar'), feverFill: $('feverFill'),
    bubble: $('bubble'), bubbleText: $('bubbleText'),
    peteReact: $('peteReact'), peteWrap: $('peteWrap'), touchPad: $('touchPad'),
    titleBest: $('titleBest'), finalScore: $('finalScore'), finalBest: $('finalBest'),
    finalLevel: $('finalLevel'), finalStats: $('finalStats'), newBest: $('newBest'),
    finalRank: $('finalRank'),
    levelUp: $('levelUp'), levelUpNum: $('levelUpNum'), levelUpKeys: $('levelUpKeys'),
    chat: $('chat'), viewers: $('viewers'),
  };

  /* ---------------- Storage ---------------- */
  function loadBest() {
    try { return parseInt(localStorage.getItem(CONFIG.bestKey), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(CONFIG.bestKey, String(v)); } catch (e) { /* private mode etc. */ }
  }

  /* ---------------- State ---------------- */
  const S = {
    phase: 'title',  // title | playing | paused | over
    score: 0, combo: 0, maxCombo: 0, lives: CONFIG.lives,
    level: 1, levelHits: 0, levelTime: 0, levelUpTimer: 0, levelDone: false,
    lanes: CONFIG.lanes,
    letters: CONFIG.firstLetters.slice(0, CONFIG.lanes),
    tiles: [], effects: [], spawnTimer: 0.6, time: 0,
    stats: { perfect: 0, good: 0, miss: 0, gold: 0, hearts: 0, bombs: 0, dodged: 0, fevers: 0 },
    fever: 0, feverTime: 0,
    viewers: 37, peakViewers: 37,
    best: loadBest(), overAt: 0,
    laneFlash: [], muted: false,
  };

  /* ---------------- Audio: synth blips + optional voice clips ---------------- */
  let actx = null;
  function audioCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { actx = new AC(); } catch (e) { actx = null; } }
    }
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function beep(freq, dur, type, vol, delay) {
    if (S.muted || !actx) return;
    const t = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    hit: (lane, perfect) => beep([523, 659, 784, 880][lane] * (perfect ? 2 : 1), 0.09, 'square', 0.04),
    gold: () => [1046, 1318, 1568].forEach((f, i) => beep(f, 0.08, 'square', 0.035, i * 0.04)),
    heart: () => [659, 880, 1318].forEach((f, i) => beep(f, 0.1, 'triangle', 0.06, i * 0.06)),
    miss: () => { beep(140, 0.18, 'sawtooth', 0.05); beep(100, 0.2, 'sawtooth', 0.04, 0.05); },
    bomb: () => { beep(90, 0.35, 'sawtooth', 0.08); beep(55, 0.45, 'square', 0.06, 0.04); beep(180, 0.1, 'sawtooth', 0.05); },
    dodge: () => beep(1200, 0.05, 'triangle', 0.03),
    fever: () => [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => beep(f, 0.09, 'square', 0.045, i * 0.06)),
    levelUp: () => [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.14, 'square', 0.05, i * 0.09)),
    over: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.22, 'triangle', 0.06, i * 0.16)),
  };

  // Voice clips: loaded the first time a phrase is used. A missing file is
  // remembered and skipped from then on.
  const clipCache = new Map();
  function playClip(path) {
    if (!path || S.muted) return;
    let entry = clipCache.get(path);
    if (entry === 'missing') return;
    if (!entry) {
      const a = new Audio();
      a.preload = 'auto';
      a.addEventListener('error', () => clipCache.set(path, 'missing'), { once: true });
      a.src = path;
      entry = a; clipCache.set(path, a);
    }
    try {
      entry.currentTime = 0;
      const p = entry.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  /* ---------------- Speech bubble ---------------- */
  let lastLine = null, bubbleTimer = 0, bubbleKind = null, lastMissBubbleAt = -10;
  function say(kind) {
    const list = CATCHPHRASES[kind];
    if (!list || !list.length) return;
    const choices = list.length > 1 ? list.filter((p) => p.text !== lastLine) : list;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    lastLine = pick.text; bubbleKind = kind;
    el.bubbleText.textContent = pick.text;
    el.bubble.dataset.kind = kind;
    el.bubble.classList.toggle('bad', kind === 'miss');
    el.bubble.classList.remove('show', 'hide');
    void el.bubble.offsetWidth; // restart the pop animation
    el.bubble.classList.add('show');
    bubbleTimer = CONFIG.bubbleTime;
    if (kind === 'miss') lastMissBubbleAt = S.time;
    playClip(pick.audio);
    Pete.talk(0.35 + pick.text.length * 0.06);
  }
  function hideBubble(instant) {
    bubbleTimer = 0; bubbleKind = null;
    el.bubble.classList.remove('show');
    if (instant) el.bubble.classList.remove('hide'); else el.bubble.classList.add('hide');
  }

  /* ---------------- Stream chat ---------------- */
  let chatCooldown = 0;
  const nameColors = ['#ff2bd6', '#22d3ff', '#39ff6a', '#ffe14a', '#ff8a3d', '#b98bff', '#ff5d7a'];
  const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function chat(kind, force) {
    const lines = CHAT[kind];
    if (!lines || !lines.length || !el.chat) return;
    if (!force && chatCooldown > 0) return;
    chatCooldown = 0.18;
    const li = document.createElement('li');
    const name = pickOf(CHAT.names);
    const n = document.createElement('b');
    n.textContent = name + ':';
    n.style.color = nameColors[(name.length * 7 + name.charCodeAt(0)) % nameColors.length];
    li.appendChild(n);
    li.appendChild(document.createTextNode(' ' + pickOf(lines)));
    li.className = 'chat-' + kind;
    el.chat.appendChild(li);
    while (el.chat.children.length > 7) el.chat.removeChild(el.chat.firstChild);
  }
  function chatBurst(kind, n) {
    for (let i = 0; i < n; i++) setTimeout(() => chat(kind, true), i * 140 + Math.random() * 90);
  }
  function viewerTarget() {
    if (S.phase === 'title') return 37;
    let v = 40 + S.score / 35 + S.combo * 7 + (S.level - 1) * 45;
    if (S.feverTime > 0) v *= 1.6;
    if (S.phase === 'over') v *= 0.7;
    return v;
  }

  /* =======================================================================
     ANIMATED PETE
     The sprite is cut into layers (body, head, hands) at load time so his
     head can bob and tilt, his eyes blink, his mouth moves when he talks and
     his hands tap the keys. Extra bits (shades, sweat, fire, confetti...) are
     drawn on top. All coordinates are in sprite pixels (476 x 461).
     ======================================================================= */
  const Pete = (function () {
    const SW = 476, SH = 461, RES = 2;       // drawn at 2x for smoother turns
    const PIVOT = [232, 204];                 // neck: the head turns around here
    const HEAD = [[150, 6], [314, 6], [316, 118], [299, 150], [283, 172], [263, 196], [242, 212],
      [220, 208], [198, 193], [178, 171], [163, 146], [150, 124], [124, 114], [122, 40]];
    const HEAD_CLEAR_Y = 138;                 // body keeps its own pixels below here
    const EYES = [[194, 126, 31, 15], [247, 127, 26, 14]];
    const MOUTH = [[197, 169], [259, 166], [258, 181], [242, 196], [214, 196], [198, 184]];
    const HANDS = [
      [[132, 378], [166, 362], [204, 366], [224, 392], [218, 428], [176, 430], [136, 410]],
      [[226, 369], [254, 360], [287, 364], [291, 381], [262, 388], [238, 386], [226, 379]],
    ];
    const SKIN = '#f38a48', SHADE = '#d25c31', LINE = '#4d1e16', SOOT_SKIN = '#583325';

    const cv = $('peteCanvas');
    const g = cv.getContext('2d');
    cv.width = SW * RES; cv.height = SH * RES;
    let L = null;                              // layers, built once the images load

    const P = {
      t: 0, blinkT: 0, nextBlink: 2.5, talkT: 0, nodT: 0, shakeT: 0, sootT: 0, shockT: 0,
      hand: [0, 0], nextHand: 0, parts: [], sweatT: 0, rainT: 0, lookT: 0, look: 0,
    };

    function mk() { const c = document.createElement('canvas'); c.width = SW; c.height = SH; return c; }
    function path(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
    function cut(img, pts) {
      const c = mk(), x = c.getContext('2d');
      path(x, pts); x.clip(); x.drawImage(img, 0, 0, SW, SH); return c;
    }
    function tinted(src, color) {
      const c = mk(), x = c.getContext('2d');
      x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-atop';
      x.fillStyle = color; x.fillRect(0, 0, SW, SH); return c;
    }
    function build() {
      const img = $('pete'), cheer = $('peteCheer');
      if (!img.complete || !img.naturalWidth || !cheer.complete || !cheer.naturalWidth) return;
      const body = mk(), b = body.getContext('2d');
      b.drawImage(img, 0, 0, SW, SH);
      // take the top of the head out of the body so the hair can move freely
      b.save(); b.globalCompositeOperation = 'destination-out';
      b.beginPath(); b.rect(0, 0, SW, HEAD_CLEAR_Y); b.clip(); path(b, HEAD); b.fill(); b.restore();
      const head = cut(img, HEAD);
      L = {
        body, head, soot: tinted(head, 'rgba(28,18,24,0.72)'),
        hands: HANDS.map((h) => cut(img, h)), cheer,
      };
    }
    ['pete', 'peteCheer'].forEach((id) => $(id).addEventListener('load', build));
    build();

    /* ----- events from the game ----- */
    function talk(sec) { P.talkT = Math.max(P.talkT, sec); }
    function nod() { P.nodT = 0.28; }
    function shake() { P.shakeT = 0.5; }
    function tap() {
      P.hand[P.nextHand] = 0.09; P.nextHand = 1 - P.nextHand;
    }
    function puff(type, n, x, y, spread) {
      for (let i = 0; i < n; i++) {
        P.parts.push(makePart(type, x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread));
      }
    }
    function makePart(type, x, y) {
      const r = Math.random;
      switch (type) {
        case 'spark': return { type, x, y, vx: (r() - 0.5) * 40, vy: -20 - r() * 40, t: 0, life: 0.5 + r() * 0.3, s: 3 + r() * 4, c: r() < 0.5 ? '#ffe14a' : '#ffffff' };
        case 'gold':  return { type: 'spark', x, y, vx: (r() - 0.5) * 120, vy: -40 - r() * 90, t: 0, life: 0.8, s: 4 + r() * 5, c: '#ffe14a' };
        case 'heart': return { type, x, y, vx: (r() - 0.5) * 50, vy: -40 - r() * 40, t: 0, life: 1.2, s: 2 + r() * 1.5 };
        case 'sweat': return { type, x, y, vx: (x > PIVOT[0] ? 14 : -14), vy: 10, t: 0, life: 1.0, s: 1 };
        case 'grawlix': return { type, x, y, vx: (r() - 0.5) * 20, vy: -45, t: 0, life: 1.0, text: pickOf(['#@!', '$%&!', '@#*!', '?!#', '&%!']) };
        case 'smoke': return { type, x, y, vx: (r() - 0.5) * 140, vy: -30 - r() * 90, t: 0, life: 0.9 + r() * 0.5, s: 12 + r() * 16 };
        case 'confetti': return { type, x, y, vx: (r() - 0.5) * 80, vy: 40 + r() * 80, t: 0, life: 2.2, s: 4 + r() * 4, c: pickOf(CONFIG.laneColors), spin: r() * 6 };
        case 'rain': return { type, x, y, vx: 0, vy: 260, t: 0, life: 0.45, s: 1 };
        default: return { type, x, y, vx: 0, vy: 0, t: 0, life: 0.5, s: 4 };
      }
    }
    function hit(grade, kind) {
      nod();
      if (grade === 'PERFECT') puff('spark', 3, 232, 70, 200);
      if (kind === 'gold') puff('gold', 14, 232, 120, 160);
      if (kind === 'heart') puff('heart', 7, 232, 120, 140);
    }
    function miss() {
      shake();
      P.parts.push(makePart('grawlix', 330 + Math.random() * 30, 70));
    }
    function bomb() {
      shake(); P.sootT = 1.8; P.shockT = 0.9;
      puff('smoke', 14, 232, 110, 90);
    }
    function cheer() { puff('confetti', 30, SW / 2, -10, SW); }
    function reset() { P.parts = []; P.sootT = 0; P.shockT = 0; P.shakeT = 0; P.talkT = 0; }

    /* ----- per-frame update ----- */
    function update(dt) {
      P.t += dt;
      ['talkT', 'nodT', 'shakeT', 'sootT', 'shockT'].forEach((k) => { P[k] = Math.max(0, P[k] - dt); });
      P.hand[0] = Math.max(0, P.hand[0] - dt); P.hand[1] = Math.max(0, P.hand[1] - dt);
      // blinking: every few seconds, sometimes a double blink
      P.nextBlink -= dt;
      if (P.nextBlink <= 0) { P.blinkT = 0.13; P.nextBlink = Math.random() < 0.2 ? 0.25 : 1.8 + Math.random() * 3.2; }
      P.blinkT = Math.max(0, P.blinkT - dt);
      // glances: a little lean towards the lanes now and then
      P.lookT -= dt;
      if (P.lookT <= 0) { P.look = Math.random() < 0.5 ? 0 : (Math.random() < 0.7 ? 1 : -1); P.lookT = 1.5 + Math.random() * 3; }
      // ambient particles
      const nervous = S.phase === 'playing' && S.lives <= 2;
      if (nervous) {
        P.sweatT -= dt;
        if (P.sweatT <= 0) { P.sweatT = 0.7 + Math.random() * 0.6; P.parts.push(makePart('sweat', Math.random() < 0.5 ? 168 : 296, 96 + Math.random() * 20)); }
      }
      if (cheerTimer > 0 && Math.random() < dt * 14) P.parts.push(makePart('confetti', Math.random() * SW, -8));
      if (S.phase === 'over') {
        P.rainT -= dt;
        if (P.rainT <= 0) { P.rainT = 0.06; P.parts.push(makePart('rain', 170 + Math.random() * 130, 46)); }
      }
      for (const p of P.parts) {
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type === 'smoke') { p.vx *= 0.96; p.vy *= 0.96; p.s += dt * 20; }
        if (p.type === 'sweat') p.vy += 260 * dt;
        if (p.type === 'confetti') p.vx += Math.sin(P.t * 5 + p.spin) * 30 * dt;
      }
      P.parts = P.parts.filter((p) => p.t < p.life);
      if (P.parts.length > 220) P.parts.splice(0, P.parts.length - 220);
    }

    /* ----- drawing helpers ----- */
    function eyesClosed(style) {
      for (const [x, y, w, h] of EYES) {
        g.fillStyle = SKIN; g.fillRect(x - 1, y - 1, w + 2, h + 2);
        g.strokeStyle = LINE; g.lineWidth = 2.5; g.lineCap = 'square';
        g.beginPath();
        if (style === 'squeeze') {           // > <   tight shut
          const cx = x + w / 2, cy = y + h / 2;
          const d = x < PIVOT[0] ? 1 : -1;
          g.moveTo(cx - 7 * d, cy - 5); g.lineTo(cx + 5 * d, cy); g.lineTo(cx - 7 * d, cy + 5);
        } else if (style === 'happy') {      // ^ ^
          g.moveTo(x + 2, y + h * 0.75); g.quadraticCurveTo(x + w / 2, y - 1, x + w - 2, y + h * 0.75);
        } else {                             // plain blink
          g.moveTo(x + 1, y + h * 0.55); g.quadraticCurveTo(x + w / 2, y + h * 0.9, x + w - 1, y + h * 0.55);
        }
        g.stroke();
      }
    }
    function sootEyes() {
      for (const [x, y, w, h] of EYES) {
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2 - 2, h / 2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111'; g.fillRect(x + w / 2 - 3, y + h / 2 - 3, 6, 6);
      }
    }
    function mouth(style) {
      path(g, MOUTH); g.fillStyle = P.sootT > 0 ? SOOT_SKIN : SKIN; g.fill();
      g.strokeStyle = LINE; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath();
      if (style === 'closed') {
        g.moveTo(205, 176); g.quadraticCurveTo(230, 190, 254, 172);
        g.stroke();
        g.strokeStyle = SHADE; g.lineWidth = 2;
        g.beginPath(); g.moveTo(222, 192); g.lineTo(238, 192); g.stroke();
      } else if (style === 'mid') {
        g.moveTo(206, 175); g.quadraticCurveTo(230, 198, 253, 172);
        g.quadraticCurveTo(230, 182, 206, 175); g.fillStyle = '#5a1410'; g.fill(); g.stroke();
        g.fillStyle = '#f4ead8'; g.fillRect(214, 176, 30, 3);
      } else if (style === 'frown') {
        g.moveTo(208, 188); g.quadraticCurveTo(230, 172, 252, 186); g.stroke();
      } else if (style === 'o') {
        g.ellipse(230, 182, 11, 13, 0, 0, Math.PI * 2);
        g.fillStyle = '#3a0a0a'; g.fill(); g.stroke();
      }
    }
    function shades() {
      g.fillStyle = '#0b0614';
      g.fillRect(186, 124, 96, 5);                       // top bar
      g.beginPath();
      g.moveTo(190, 124); g.lineTo(228, 124); g.lineTo(226, 140); g.lineTo(214, 146); g.lineTo(198, 145); g.lineTo(191, 136); g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(244, 124); g.lineTo(280, 124); g.lineTo(278, 136); g.lineTo(271, 145); g.lineTo(256, 146); g.lineTo(246, 140); g.closePath(); g.fill();
      g.fillRect(170, 125, 18, 3); g.fillRect(280, 125, 14, 3); // arms
      // pixel glint that sweeps across now and then
      const k = (P.t * 0.6) % 1.6;
      if (k < 1) {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        const gx = 194 + k * 80;
        g.fillRect(gx, 129, 4, 3); g.fillRect(gx + 4, 132, 3, 3);
      }
      g.fillStyle = '#ff2bd6'; g.fillRect(197, 129, 6, 2); g.fillStyle = '#22d3ff'; g.fillRect(250, 129, 6, 2);
    }
    function flames(power) {
      // flickering fire around Pete (behind him)
      g.save(); g.globalCompositeOperation = 'lighter';
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (1.05 + 0.9 * (i / (n - 1)));
        const flick = Math.sin(P.t * 13 + i * 2.3) * 0.5 + Math.sin(P.t * 7.1 + i) * 0.5;
        const r0 = 130 + (i % 2) * 18, r1 = r0 + (45 + flick * 22) * power;
        const bx = PIVOT[0] + Math.cos(a) * r0 * 1.2, by = PIVOT[1] + 40 + Math.sin(a) * r0;
        const tx = PIVOT[0] + Math.cos(a) * r1 * 1.2, ty = PIVOT[1] + 40 + Math.sin(a) * r1 - 10 * power;
        const nx = -Math.sin(a) * 14, ny = Math.cos(a) * 14;
        const grd = g.createLinearGradient(bx, by, tx, ty);
        grd.addColorStop(0, 'rgba(255,90,20,0.55)'); grd.addColorStop(0.6, 'rgba(255,200,40,0.35)'); grd.addColorStop(1, 'rgba(255,240,120,0)');
        g.fillStyle = grd;
        g.beginPath(); g.moveTo(bx - nx, by - ny); g.lineTo(tx, ty); g.lineTo(bx + nx, by + ny); g.closePath(); g.fill();
      }
      g.restore();
    }
    function pixelHeart(x, y, s, c) {
      g.fillStyle = c;
      const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
      rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') g.fillRect(x + (i - 3.5) * s, y + j * s, s, s); });
    }
    function cloud() {
      g.fillStyle = 'rgba(70,70,95,0.92)';
      const cx = 236 + Math.sin(P.t * 0.8) * 6, cy = 30;
      [[-46, 6, 26], [-16, -6, 32], [20, -2, 30], [48, 8, 22], [0, 12, 30]].forEach(([dx, dy, r]) => {
        g.beginPath(); g.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); g.fill();
      });
    }

    /* ----- the frame ----- */
    function render() {
      g.setTransform(RES, 0, 0, RES, 0, 0);
      g.clearRect(0, 0, SW, SH);
      if (!L) return;
      g.imageSmoothingEnabled = false;
      const t = P.t;
      const playing = S.phase === 'playing';
      const over = S.phase === 'over';
      const fever = S.feverTime > 0;
      const hype = fever || S.combo >= CONFIG.shadesCombo;
      const nervous = playing && S.lives <= 2;

      if (fever) flames(1);
      else if (playing && S.combo >= CONFIG.shadesCombo) flames(0.45);

      if (cheerTimer > 0) {
        // celebration pose: bounce + a little wiggle
        const bounce = Math.round(-Math.abs(Math.sin(t * 9)) * 8);
        g.save();
        g.translate(SW / 2, SH);
        g.rotate(Math.sin(t * 9) * 0.02);
        g.drawImage(L.cheer, -SW / 2, -SH + bounce, SW, SH);
        g.restore();
      } else {
        // body breathes a touch
        const breathe = Math.round(Math.sin(t * 2.6) * 1.2);
        g.drawImage(L.body, 0, breathe > 0 ? 1 : 0);
        L.hands.forEach((h, i) => g.drawImage(h, 0, (P.hand[i] > 0 ? 3 : 0) + (breathe > 0 ? 1 : 0)));

        // head motion
        let rot = Math.sin(t * 1.3) * 0.012 + P.look * 0.03;
        let dx = P.look * 2, dy = Math.sin(t * 2.6) * 1.3;
        if (P.nodT > 0) dy += Math.sin((1 - P.nodT / 0.28) * Math.PI) * 6;
        if (P.shakeT > 0) rot += Math.sin(t * 38) * 0.06 * (P.shakeT / 0.5);
        if (nervous) { rot += Math.sin(t * 27) * 0.008; dx += Math.sin(t * 31) * 0.8; }
        if (fever) dy -= Math.abs(Math.sin(t * 7.5)) * 5;
        if (P.talkT > 0) dy += Math.sin(t * 22) * 0.8;
        if (over) { rot = 0.07 + Math.sin(t * 0.9) * 0.01; dy = 9; dx = 0; }

        g.save();
        g.translate(PIVOT[0] + dx, PIVOT[1] + dy);
        g.rotate(rot);
        g.translate(-PIVOT[0], -PIVOT[1]);
        g.drawImage(P.sootT > 0 ? L.soot : L.head, 0, 0);

        // eyes
        if (P.sootT > 0) sootEyes();
        else if (over) eyesClosed('blink');
        else if (P.shakeT > 0.15) eyesClosed('squeeze');
        else if (P.nodT > 0.1 && !hype) eyesClosed('happy');
        else if (P.blinkT > 0 && !hype) eyesClosed('blink');

        // mouth
        if (P.shockT > 0) mouth('o');
        else if (over) mouth('frown');
        else if (P.talkT > 0) {
          const ph = Math.floor(t * 11) % 3;
          if (ph === 1) mouth('mid'); else if (ph === 2) mouth('closed');
        } else if (P.shakeT > 0.1 || (nervous && Math.sin(t * 1.7) > 0.4)) mouth('frown');

        if (hype && P.sootT <= 0 && !over) shades();
        g.restore();
      }

      if (over) cloud();

      // particles
      for (const p of P.parts) {
        const k = p.t / p.life;
        g.globalAlpha = Math.min(1, (1 - k) * 2);
        if (p.type === 'spark') {
          g.fillStyle = p.c;
          const s = p.s * (1 - k * 0.5);
          g.fillRect(p.x - s / 2, p.y - s * 1.5, s, s * 3); g.fillRect(p.x - s * 1.5, p.y - s / 2, s * 3, s);
        } else if (p.type === 'heart') {
          pixelHeart(p.x, p.y, p.s, '#ff2bd6');
        } else if (p.type === 'sweat') {
          g.fillStyle = '#7fd8ff';
          g.beginPath(); g.moveTo(p.x, p.y - 7); g.quadraticCurveTo(p.x + 5, p.y, p.x, p.y + 4); g.quadraticCurveTo(p.x - 5, p.y, p.x, p.y - 7); g.fill();
          g.fillStyle = '#fff'; g.fillRect(p.x - 2, p.y - 2, 2, 2);
        } else if (p.type === 'grawlix') {
          g.font = "22px 'Press Start 2P', monospace"; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = 6; g.strokeStyle = '#140b1e'; g.strokeText(p.text, p.x, p.y);
          g.fillStyle = '#ff3b3b'; g.fillText(p.text, p.x, p.y);
        } else if (p.type === 'smoke') {
          g.fillStyle = 'rgba(60,55,70,0.75)';
          g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill();
        } else if (p.type === 'confetti') {
          g.save(); g.translate(p.x, p.y); g.rotate(p.spin + p.t * 6);
          g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
        } else if (p.type === 'rain') {
          g.fillStyle = '#7fb8ff'; g.fillRect(p.x, p.y, 2, 9);
        }
      }
      g.globalAlpha = 1;
    }

    function state() {
      return { ready: !!L, particles: P.parts.length, talking: P.talkT > 0, soot: P.sootT > 0,
        shades: S.feverTime > 0 || S.combo >= CONFIG.shadesCombo, t: P.t };
    }

    return { update, render, talk, tap, hit, miss, bomb, cheer, reset, state };
  })();

  /* ---------------- Pete reactions (whole-sprite CSS moves) ---------------- */
  let reactTimer = 0, cheerTimer = 0;
  function react(cls) {
    if (cheerTimer > 0) return; // don't interrupt the celebration
    const r = el.peteReact;
    r.classList.remove('happy', 'shake');
    void r.offsetWidth;
    r.classList.add(cls);
    reactTimer = 0.45;
  }
  function cheer(seconds) {
    const r = el.peteReact;
    r.classList.remove('happy', 'shake');
    r.classList.add('cheer');
    el.peteWrap.classList.add('cheering');
    cheerTimer = seconds;
    Pete.cheer();
  }

  /* ---------------- Lanes / letters ---------------- */
  function lanesFor(level) {
    return CONFIG.fourthLaneLevel && level >= CONFIG.fourthLaneLevel ? Math.max(4, CONFIG.lanes) : CONFIG.lanes;
  }
  function pickLetters(level) {
    const n = lanesFor(level);
    if (level === 1) return CONFIG.firstLetters.slice(0, n);
    const pool = (level <= 3 ? CONFIG.easyLetters : CONFIG.allLetters).split('');
    let out;
    do {
      out = [];
      const p = pool.slice();
      for (let i = 0; i < n; i++) out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
    } while (out.join('') === S.letters.join(''));
    return out;
  }
  function buildTouchPad() {
    el.touchPad.innerHTML = '';
    for (let i = 0; i < S.lanes; i++) {
      const b = document.createElement('button');
      b.className = 'lane-btn'; b.dataset.lane = String(i);
      b.style.setProperty('--c', CONFIG.laneColors[i]);
      b.setAttribute('aria-label', 'Lane ' + (i + 1));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        markTouch();
        b.classList.add('down');
        setTimeout(() => b.classList.remove('down'), 110);
        if (S.phase === 'playing') pressLane(i);
      });
      el.touchPad.appendChild(b);
    }
    updateTouchLabels();
  }
  function updateTouchLabels() {
    const btns = el.touchPad.children;
    for (let i = 0; i < btns.length; i++) btns[i].textContent = S.letters[i];
  }
  function setLetters(letters) {
    S.letters = letters;
    if (letters.length !== S.lanes) { S.lanes = letters.length; buildTouchPad(); }
    else updateTouchLabels();
  }
  function markTouch() { app.classList.add('touch'); }
  if ('ontouchstart' in window || (window.matchMedia && matchMedia('(pointer: coarse)').matches)) markTouch();

  /* ---------------- Game flow ---------------- */
  function levelSpeed() {
    return CONFIG.levelSpeed(S.level) * (1 + Math.min(0.2, S.levelTime * CONFIG.rampPerSecond));
  }
  function levelSpawn() {
    return CONFIG.levelSpawn(S.level) * (1 - Math.min(0.15, S.levelTime * CONFIG.rampPerSecond));
  }

  function startGame() {
    audioCtx();
    Object.assign(S, {
      phase: 'playing', score: 0, combo: 0, maxCombo: 0, lives: CONFIG.lives,
      level: 1, levelHits: 0, levelTime: 0, levelUpTimer: 0, levelDone: false,
      tiles: [], effects: [], spawnTimer: 0.8, time: 0,
      stats: { perfect: 0, good: 0, miss: 0, gold: 0, hearts: 0, bombs: 0, dodged: 0, fevers: 0 },
      fever: 0, feverTime: 0, peakViewers: Math.round(S.viewers),
    });
    setLetters(pickLetters(1));
    hideBubble(true);
    el.peteReact.classList.remove('cheer', 'happy', 'shake');
    el.peteWrap.classList.remove('cheering');
    app.classList.remove('fever');
    cheerTimer = 0; lastLine = null;
    Pete.reset();
    setPhase('playing');
    chatBurst('hello', 3);
    updateHud();
  }

  function setPhase(p) {
    S.phase = p;
    app.className = app.className.replace(/\bphase-\w+/g, '').trim() + ' phase-' + p;
    if (p === 'title') el.titleBest.textContent = S.best;
  }

  function togglePause() {
    if (S.phase === 'playing') setPhase('paused');
    else if (S.phase === 'paused') { setPhase('playing'); last = performance.now(); }
  }

  function rankFor() {
    const st = S.stats, total = st.perfect + st.good + st.miss;
    if (!total) return { rank: '-', acc: 0 };
    const acc = (st.perfect + st.good * 0.6) / total;
    const rank = acc >= 0.92 ? 'S' : acc >= 0.82 ? 'A' : acc >= 0.68 ? 'B' : acc >= 0.5 ? 'C' : 'D';
    return { rank, acc };
  }

  function gameOver() {
    const isNew = S.score > S.best;
    if (isNew) { S.best = S.score; saveBest(S.best); }
    endFever();
    el.finalScore.textContent = S.score;
    el.finalBest.textContent = S.best;
    el.finalLevel.textContent = S.level;
    el.newBest.classList.toggle('on', isNew && S.score > 0);
    const r = rankFor();
    el.finalRank.textContent = r.rank;
    el.finalRank.dataset.rank = r.rank;
    el.finalStats.innerHTML = 'PERFECT ' + S.stats.perfect + ' &middot; GOOD ' + S.stats.good +
      ' &middot; MISS ' + S.stats.miss + '<br>ACCURACY ' + Math.round(r.acc * 100) + '% &middot; BEST COMBO ' + S.maxCombo +
      '<br>GOLD ' + S.stats.gold + ' &middot; BOMBS DODGED ' + S.stats.dodged + ' &middot; FEVERS ' + S.stats.fevers +
      '<br>PEAK VIEWERS ' + S.peakViewers.toLocaleString();
    S.overAt = performance.now();
    setPhase('over');
    sfx.over();
    chatBurst('over', 3);
  }

  function startLevelUp() {
    S.level += 1;
    S.levelHits = 0; S.levelTime = 0; S.levelDone = false;
    S.lives = Math.min(CONFIG.lives, S.lives + 1);
    const bonus = CONFIG.levelBonus * (S.level - 1);
    S.score += bonus;
    const oldLanes = S.lanes;
    setLetters(pickLetters(S.level));
    S.levelUpTimer = CONFIG.levelUpPause;
    S.spawnTimer = 0.4;
    el.levelUpNum.textContent = 'LEVEL ' + S.level;
    const news = [];
    if (S.lanes > oldLanes) news.push('<span class="pink">NEW LANE!</span>');
    for (const k of Object.keys(CONFIG.special)) {
      if (CONFIG.special[k].from === S.level) news.push('<span class="cyan">' + { gold: 'GOLD TILES = x3!', heart: 'HEART TILES = +1 LIFE', bomb: "BOMBS: DON'T PRESS!" }[k] + '</span>');
    }
    el.levelUpKeys.innerHTML = 'NEW KEYS: ' + S.letters.join(' ') + '<br><span class="yellow">BONUS +' + bonus + '</span>' +
      (news.length ? '<br>' + news.join('<br>') : '');
    el.levelUp.classList.remove('show'); void el.levelUp.offsetWidth; el.levelUp.classList.add('show');
    cheer(2.4);
    say('good');
    sfx.levelUp();
    chatBurst('level', 3);
    updateHud();
  }

  function startFever() {
    S.feverTime = CONFIG.feverTime; S.fever = 1;
    S.stats.fevers += 1;
    app.classList.add('fever');
    say('fever');
    sfx.fever();
    chatBurst('fever', 5);
    S.effects.push({ type: 'text', text: 'FEVER x2!', lane: -1, t: 0, life: 1.2, color: '#ff8a3d' });
  }
  function endFever() {
    S.feverTime = 0; S.fever = 0;
    app.classList.remove('fever');
  }

  /* ---------------- Judging ---------------- */
  function timeOff(tile, speed) { return (tile.p - CONFIG.hitP) / speed; } // + = late

  function tryHit(candidates, lane) {
    const v = levelSpeed();
    let best = null, bestAbs = Infinity, bomb = null, bombAbs = Infinity;
    for (const t of candidates) {
      const a = Math.abs(timeOff(t, v));
      if (t.kind === 'bomb') { if (a < bombAbs) { bombAbs = a; bomb = t; } }
      else if (a < bestAbs) { bestAbs = a; best = t; }
    }
    if (best && bestAbs <= CONFIG.goodWindow) {
      const grade = bestAbs <= CONFIG.perfectWindow ? 'PERFECT' : 'GOOD';
      registerHit(best, grade);
    } else if (bomb && bombAbs <= CONFIG.goodWindow) {
      registerBomb(bomb);
    } else {
      registerMiss(lane, 'wrong');
    }
  }

  function pressLetter(letter) {
    const lane = S.letters.indexOf(letter);
    if (lane >= 0) S.laneFlash[lane] = 0.12;
    Pete.tap();
    const cands = S.tiles.filter((t) => !t.judged && t.letter === letter);
    tryHit(cands, lane);
  }
  function pressLane(lane) {
    S.laneFlash[lane] = 0.12;
    Pete.tap();
    const cands = S.tiles.filter((t) => !t.judged && t.lane === lane);
    tryHit(cands, lane);
  }

  function laneText(lane, text, color) {
    S.effects = S.effects.filter((e) => !(e.type === 'text' && e.lane === lane));
    S.effects.push({ type: 'text', text, lane, t: 0, life: 0.6, color });
  }

  function registerHit(tile, grade) {
    tile.judged = 'hit';
    S.combo += 1;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    const mult = Math.min(4, 1 + Math.floor(S.combo / 10));
    let pts = CONFIG.points[grade] * mult * (S.feverTime > 0 ? 2 : 1);
    if (tile.kind === 'gold') { pts *= CONFIG.goldMult; S.stats.gold += 1; }
    S.score += pts;
    S.stats[grade === 'PERFECT' ? 'perfect' : 'good'] += 1;
    S.levelHits += 1;
    if (tile.kind === 'gold') {
      laneText(tile.lane, '+' + pts + '!', '#ffe14a');
      sfx.gold();
    } else if (tile.kind === 'heart') {
      S.stats.hearts += 1;
      if (S.lives < CONFIG.lives) { S.lives += 1; laneText(tile.lane, '+1 LIFE', '#ff2bd6'); }
      else { S.score += 200; laneText(tile.lane, '+200', '#ff2bd6'); }
      sfx.heart();
      chat('heart', true);
    } else {
      laneText(tile.lane, grade, grade === 'PERFECT' ? '#ffe14a' : '#39ff6a');
      sfx.hit(tile.lane, grade === 'PERFECT');
    }
    S.effects.push({ type: 'burst', lane: tile.lane, t: 0, life: 0.3, color: tile.kind === 'gold' ? '#ffe14a' : CONFIG.laneColors[tile.lane] });
    react('happy');
    Pete.hit(grade, tile.kind);
    if (S.feverTime <= 0) {
      S.fever = Math.min(1, S.fever + CONFIG.feverGain[grade] + (tile.kind === 'gold' ? CONFIG.feverGain.gold : 0));
      if (S.fever >= 1) startFever();
    }
    const milestone = CONFIG.comboMilestones.includes(S.combo) || (S.combo > 100 && S.combo % 25 === 0);
    if (milestone) {
      say('good');
      chatBurst('good', 3);
      S.effects.push({ type: 'text', text: S.combo + ' COMBO!', lane: -1, t: 0, life: 1.0, color: '#ff2bd6' });
    } else if (bubbleTimer <= 0 && Math.random() < CONFIG.goodBubbleChance) {
      say('good');
    }
    if (Math.random() < 0.22) chat(S.feverTime > 0 ? 'fever' : 'good');
    if (S.combo % 50 === 0) S.lives = Math.min(CONFIG.lives, S.lives + 1);
    if (S.levelHits >= CONFIG.levelTarget(S.level)) S.levelDone = true;
    updateHud();
  }

  function loseLife() {
    S.combo = 0;
    S.lives -= 1;
    S.stats.miss += 1;
    if (S.feverTime > 0) endFever();
    else S.fever = Math.max(0, S.fever - 0.15);
    S.effects.push({ type: 'flash', t: 0, life: 0.25 });
    react('shake');
    // Always react to a miss, but don't flicker if misses come thick and fast
    if (!(bubbleKind === 'miss' && S.time - lastMissBubbleAt < 0.7)) say('miss');
    S.viewers *= 0.94;
  }

  function registerMiss(lane, why) {
    loseLife();
    laneText(lane, why === 'wrong' ? 'WRONG!' : 'MISS', '#ff3b3b');
    sfx.miss();
    Pete.miss();
    chat('miss', Math.random() < 0.5);
    updateHud();
    if (S.lives <= 0) gameOver();
  }

  function registerBomb(tile) {
    tile.judged = 'boom';
    S.stats.bombs += 1;
    loseLife();
    laneText(tile.lane, 'BOOM!', '#ff8a3d');
    S.effects.push({ type: 'boom', lane: tile.lane, p: tile.p, t: 0, life: 0.6 });
    S.effects.push({ type: 'shake', t: 0, life: 0.35 });
    sfx.bomb();
    Pete.bomb();
    chatBurst('bomb', 2);
    updateHud();
    if (S.lives <= 0) gameOver();
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    el.score.textContent = S.score;
    el.combo.textContent = '×' + S.combo;
    el.level.textContent = 'LV ' + S.level;
    const target = CONFIG.levelTarget(S.level);
    el.levelFill.style.width = Math.min(100, (S.levelHits / target) * 100) + '%';
    if (el.lives.children.length !== CONFIG.lives) {
      el.lives.innerHTML = '';
      for (let i = 0; i < CONFIG.lives; i++) {
        const h = document.createElement('i'); h.className = 'heart'; el.lives.appendChild(h);
      }
    }
    for (let i = 0; i < CONFIG.lives; i++) el.lives.children[i].classList.toggle('lost', i >= S.lives);
    updateFeverBar();
  }
  function updateFeverBar() {
    const f = S.feverTime > 0 ? S.feverTime / CONFIG.feverTime : S.fever;
    el.feverFill.style.width = (f * 100).toFixed(1) + '%';
  }

  /* ---------------- Update loop ---------------- */
  function update(dt) {
    S.time += dt;
    for (let i = 0; i < S.lanes; i++) S.laneFlash[i] = Math.max(0, (S.laneFlash[i] || 0) - dt);

    if (S.feverTime > 0) {
      S.feverTime -= dt;
      if (S.feverTime <= 0) endFever();
      updateFeverBar();
    }

    if (S.levelUpTimer > 0) {
      S.levelUpTimer -= dt;
    } else {
      S.levelTime += dt;
      // Only send as many tiles as the level still needs (a miss lets another one through)
      const pending = S.tiles.filter((t) => !t.judged && t.kind !== 'bomb').length;
      if (!S.levelDone && S.levelHits + pending < CONFIG.levelTarget(S.level)) {
        S.spawnTimer -= dt;
        if (S.spawnTimer <= 0) {
          spawnTile();
          S.spawnTimer += levelSpawn() * (0.85 + Math.random() * 0.3);
        }
      }
    }

    const v = levelSpeed();
    for (const t of S.tiles) {
      t.p += v * dt;
      if (!t.judged && timeOff(t, v) > CONFIG.goodWindow) {
        if (t.kind === 'bomb') {
          t.judged = 'dodged';
          S.stats.dodged += 1;
          S.score += 25;
          laneText(t.lane, 'DODGED', '#22d3ff');
          sfx.dodge();
          updateHud();
          continue;
        }
        t.judged = 'miss';
        registerMiss(t.lane, 'late');
        if (S.phase !== 'playing') return;
      }
    }
    S.tiles = S.tiles.filter((t) => t.p < 1.15 && t.judged !== 'hit' && t.judged !== 'boom');

    // Level cleared: wait for the screen to empty, then celebrate
    if (S.levelDone && S.levelUpTimer <= 0 && !S.tiles.some((t) => !t.judged)) startLevelUp();
  }

  let lastLane = -1;
  function spawnTile() {
    const n = S.lanes;
    let lane = Math.floor(Math.random() * n);
    if (lane === lastLane && Math.random() < 0.5) lane = (lane + 1 + Math.floor(Math.random() * (n - 1))) % n;
    lastLane = lane;
    let kind = 'normal';
    const sp = CONFIG.special, r = Math.random();
    if (S.level >= sp.bomb.from && r < sp.bomb.chance) kind = 'bomb';
    else if (S.level >= sp.heart.from && S.lives < CONFIG.lives && r < sp.bomb.chance + sp.heart.chance) kind = 'heart';
    else if (S.level >= sp.gold.from && r > 1 - sp.gold.chance) kind = 'gold';
    // never drop a bomb right on top of a tile in the same lane
    if (kind === 'bomb' && S.tiles.some((t) => !t.judged && t.lane === lane && t.p < 0.12)) kind = 'normal';
    S.tiles.push({ lane, letter: S.letters[lane], p: -0.08, judged: null, kind });
  }

  function tickUi(dt) {
    if (bubbleTimer > 0) { bubbleTimer -= dt; if (bubbleTimer <= 0) hideBubble(); }
    if (reactTimer > 0) { reactTimer -= dt; if (reactTimer <= 0) el.peteReact.classList.remove('happy', 'shake'); }
    if (cheerTimer > 0) { cheerTimer -= dt; if (cheerTimer <= 0) { el.peteReact.classList.remove('cheer'); el.peteWrap.classList.remove('cheering'); } }
    chatCooldown = Math.max(0, chatCooldown - dt);
    for (const e of S.effects) e.t += dt;
    S.effects = S.effects.filter((e) => e.t < e.life);
    // viewers drift towards a target that follows how well the stream is going
    const vt = viewerTarget();
    S.viewers += (vt - S.viewers) * Math.min(1, dt * 0.8) + (Math.random() - 0.5) * dt * 6;
    S.viewers = Math.max(3, S.viewers);
    if (S.phase === 'playing') S.peakViewers = Math.max(S.peakViewers, Math.round(S.viewers));
    viewerShow += dt;
    if (viewerShow > 0.25) { viewerShow = 0; el.viewers.textContent = Math.round(S.viewers).toLocaleString(); }
    // idle chatter
    idleChat -= dt;
    if (idleChat <= 0) { idleChat = 3 + Math.random() * 5; if (S.phase === 'playing' || S.phase === 'title') chat(S.phase === 'title' ? 'hello' : (S.combo >= 10 ? 'good' : 'hello')); }
    Pete.update(dt);
  }
  let viewerShow = 1, idleChat = 1.5;

  /* ---------------- Rendering ---------------- */
  let W = 0, H = 0, DPR = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  const TOP_SCALE = 0.62;
  function geo() {
    const pad = W * 0.04;
    const bw = W - pad * 2;
    return { pad, bw, cx: W / 2 };
  }
  function widthAt(g, p) { return g.bw * (TOP_SCALE + (1 - TOP_SCALE) * Math.max(0, p)); }
  function edgeX(g, e, p) { const w = widthAt(g, p); return g.cx - w / 2 + (e / S.lanes) * w; }
  function laneCenter(g, lane, p) { return (edgeX(g, lane, p) + edgeX(g, lane + 1, p)) / 2; }
  function laneW(g, p) { return widthAt(g, p) / S.lanes; }

  function font(px) { return px + "px 'Press Start 2P', ui-monospace, monospace"; }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function drawBomb(cx, cy, s, t) {
    ctx.fillStyle = '#1a1020';
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.08, s * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ff3b3b'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - s * 0.16, cy - s * 0.06, s * 0.08, s * 0.08);
    ctx.fillStyle = '#5a4a3a'; ctx.fillRect(cx + s * 0.12, cy - s * 0.34, s * 0.1, s * 0.12);
    ctx.fillStyle = Math.floor(t * 12) % 2 ? '#ffe14a' : '#ff8a3d';
    ctx.fillRect(cx + s * 0.18, cy - s * 0.46, s * 0.1, s * 0.1);
  }
  function drawMiniHeart(x, y, s) {
    const rows = ['.XX.XX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
    ctx.fillStyle = '#ff2bd6';
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') ctx.fillRect(x + i * s, y + j * s, s, s); });
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // screen shake (bombs)
    const sh = S.effects.find((e) => e.type === 'shake');
    if (sh) { const k = 1 - sh.t / sh.life; ctx.translate((Math.random() - 0.5) * 14 * k, (Math.random() - 0.5) * 10 * k); }
    const g = geo();
    const n = S.lanes;
    const fever = S.feverTime > 0;

    // lane backgrounds
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(edgeX(g, i, 0), 0); ctx.lineTo(edgeX(g, i + 1, 0), 0);
      ctx.lineTo(edgeX(g, i + 1, 1), H); ctx.lineTo(edgeX(g, i, 1), H); ctx.closePath();
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(10,6,24,0.2)');
      grd.addColorStop(1, hexA(CONFIG.laneColors[i], 0.07 + (S.laneFlash[i] || 0) * 1.2 + (fever ? 0.08 : 0)));
      ctx.fillStyle = grd; ctx.fill();
    }
    // fever: streaks rushing down the lanes
    if (fever) {
      ctx.fillStyle = 'rgba(255,170,60,0.18)';
      for (let i = 0; i < 10; i++) {
        const p = ((S.time * 1.6 + i * 0.137) % 1);
        const x = edgeX(g, 0, p) + ((i * 0.618) % 1) * widthAt(g, p);
        ctx.fillRect(x, p * H, 2, H * 0.08);
      }
    }
    // lane lines (neon)
    ctx.lineWidth = 3;
    for (let e = 0; e <= n; e++) {
      const c = CONFIG.laneColors[Math.min(n - 1, Math.max(0, e === n ? n - 1 : e))];
      ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12;
      ctx.globalAlpha = (e === 0 || e === n) ? 0.95 : 0.55;
      ctx.beginPath(); ctx.moveTo(edgeX(g, e, 0), 0); ctx.lineTo(edgeX(g, e, 1), H); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // hit line glow band
    const hy = CONFIG.hitP * H;
    const rw = laneW(g, CONFIG.hitP) * 0.8;
    const rh = Math.min(rw * 0.78, H * 0.13);
    const band = ctx.createLinearGradient(0, hy - rh, 0, hy + rh);
    band.addColorStop(0, 'rgba(255,225,74,0)'); band.addColorStop(0.5, 'rgba(255,225,74,0.16)'); band.addColorStop(1, 'rgba(255,225,74,0)');
    ctx.fillStyle = band;
    ctx.fillRect(edgeX(g, 0, CONFIG.hitP), hy - rh, widthAt(g, CONFIG.hitP), rh * 2);

    // receptors (the letter keys you hit)
    for (let i = 0; i < n; i++) {
      const c = CONFIG.laneColors[i];
      const x = laneCenter(g, i, CONFIG.hitP) - rw / 2, y = hy - rh / 2;
      const flash = S.laneFlash[i] || 0;
      ctx.shadowColor = c; ctx.shadowBlur = 18 + flash * 120;
      ctx.fillStyle = flash > 0 ? hexA(c, 0.45) : 'rgba(12,6,26,0.85)';
      roundRect(x, y, rw, rh, 6); ctx.fill();
      ctx.lineWidth = Math.max(3, rw * 0.05); ctx.strokeStyle = c; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2; ctx.strokeStyle = hexA('#ffffff', 0.5);
      roundRect(x + rw * 0.09, y + rh * 0.12, rw * 0.82, rh * 0.76, 4); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = c; ctx.shadowBlur = 10;
      ctx.font = font(Math.round(rh * 0.42)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(S.letters[i], x + rw / 2, y + rh / 2 + 2);
      ctx.shadowBlur = 0;
    }

    // HIT ZONE plate
    const pl = edgeX(g, 0, 0.95) + 4, pr = edgeX(g, n, 0.95) - 4;
    const ph = Math.max(22, Math.min(44, H * 0.06));
    const py = Math.min(H - ph - 4, hy + rh / 2 + Math.max(8, H * 0.03));
    ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffe14a'; roundRect(pl, py, pr - pl, ph, 8); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3; ctx.strokeStyle = '#7a5a00'; roundRect(pl + 4, py + 4, pr - pl - 8, ph - 8, 5); ctx.stroke();
    ctx.fillStyle = '#140b1e'; ctx.font = font(Math.round(ph * 0.42));
    ctx.fillText(fever ? 'FEVER x2' : 'HIT ZONE', (pl + pr) / 2, py + ph / 2 + 2);

    // falling tiles
    for (const t of S.tiles) {
      if (t.p < -0.1) continue;
      const kind = t.kind;
      let c = CONFIG.laneColors[t.lane];
      if (kind === 'gold') c = '#ffe14a';
      if (kind === 'bomb') c = '#ff3b3b';
      if (t.judged === 'miss') c = '#ff3b3b';
      const w = laneW(g, t.p) * 0.7, h = Math.max(18, w * 0.42);
      const x = laneCenter(g, t.lane, t.p) - w / 2, y = t.p * H - h / 2;
      ctx.globalAlpha = (t.judged === 'miss' || t.judged === 'dodged') ? Math.max(0, 0.7 - (t.p - CONFIG.hitP) * 3) : 1;
      ctx.shadowColor = c; ctx.shadowBlur = kind === 'gold' ? 24 + Math.sin(S.time * 12) * 8 : 16;
      if (kind === 'bomb') ctx.fillStyle = 'rgba(40,6,12,0.92)';
      else if (kind === 'gold') ctx.fillStyle = hexA('#ffe14a', 0.45 + Math.sin(S.time * 10 + t.p * 20) * 0.15);
      else ctx.fillStyle = hexA(c, 0.28);
      roundRect(x, y, w, h, 5); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = kind === 'bomb' && Math.floor(S.time * 6) % 2 ? '#ff8a3d' : c; ctx.stroke();
      ctx.shadowBlur = 6;
      if (kind === 'bomb') {
        ctx.shadowBlur = 0;
        drawBomb(x + w / 2, y + h / 2, h, S.time);
      } else {
        ctx.fillStyle = kind === 'gold' ? '#3a2600' : '#ffffff';
        ctx.font = font(Math.round(h * 0.5));
        ctx.fillText(t.letter, x + w / 2, y + h / 2 + 2);
        ctx.shadowBlur = 0;
        if (kind === 'heart') drawMiniHeart(x + w - h * 0.5, y + h * 0.12, Math.max(1.5, h * 0.06));
        if (kind === 'gold') {
          ctx.fillStyle = '#ffffff';
          const sx = x + w * (0.15 + 0.7 * ((S.time * 0.8 + t.p) % 1)), sy = y + h * 0.25, s = Math.max(2, h * 0.07);
          ctx.fillRect(sx - s / 2, sy - s * 1.5, s, s * 3); ctx.fillRect(sx - s * 1.5, sy - s / 2, s * 3, s);
        }
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // effects
    for (const e of S.effects) {
      const k = e.t / e.life;
      if (e.type === 'burst') {
        const cx = laneCenter(g, e.lane, CONFIG.hitP);
        ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 4;
        ctx.shadowColor = e.color; ctx.shadowBlur = 20;
        const s = rw * (0.5 + k * 0.5);
        ctx.strokeRect(cx - s / 2 - k * 10, hy - rh / 2 - k * 10, s + k * 20, rh + k * 20);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      } else if (e.type === 'boom') {
        const cx = laneCenter(g, e.lane, e.p), cy = e.p * H;
        const r = rw * (0.3 + k * 1.1);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.25 * (1 - k), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.type === 'text') {
        const cx = e.lane >= 0 ? laneCenter(g, e.lane, CONFIG.hitP) : W / 2;
        const y0 = e.lane >= 0 ? hy - rh * 0.9 : H * 0.42;
        ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        ctx.fillStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 12;
        const size = e.lane >= 0 ? Math.max(9, Math.min(18, rw * 0.15)) : Math.max(14, Math.min(28, W * 0.045));
        ctx.font = font(Math.round(size));
        ctx.fillText(e.text, cx, y0 - k * 40);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      } else if (e.type === 'flash') {
        ctx.fillStyle = 'rgba(255,40,60,' + (0.18 * (1 - k)) + ')';
        ctx.fillRect(-20, -20, W + 40, H + 40);
      }
    }
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)) + ')';
  }

  /* ---------------- Main loop ---------------- */
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1; // tab was asleep etc.
    if (S.phase === 'playing') update(dt);
    if (S.phase !== 'paused') tickUi(dt);
    render();
    Pete.render();
    requestAnimationFrame(frame);
  }

  /* ---------------- Input ---------------- */
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (S.phase === 'title') startGame();
      else if (S.phase === 'over' && performance.now() - S.overAt > 600) startGame();
      else if (S.phase === 'paused') togglePause();
      return;
    }
    if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); togglePause(); return; }
    if (k === 'm' || k === 'M') { S.muted = !S.muted; return; }
    if (e.repeat) return;
    if (S.phase === 'playing' && /^[a-zA-Z]$/.test(k)) { e.preventDefault(); pressLetter(k.toUpperCase()); }
  });

  $('startBtn').addEventListener('click', () => { if (S.phase === 'title') startGame(); });
  $('restartBtn').addEventListener('click', () => { if (S.phase === 'over' && performance.now() - S.overAt > 600) startGame(); });
  $('resumeBtn').addEventListener('click', togglePause);
  $('quitBtn').addEventListener('click', () => { S.tiles = []; hideBubble(true); endFever(); setPhase('title'); });
  $('pauseBtn').addEventListener('click', togglePause);
  // tapping anywhere on the title screen starts the game
  $('titleScreen').addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') markTouch();
    if (e.target.id !== 'startBtn' && e.pointerType === 'touch' && S.phase === 'title') startGame();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.phase === 'playing') togglePause(); });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchstart', markTouch, { passive: true });

  /* ---------------- Boot ---------------- */
  buildTouchPad();
  updateHud();
  setPhase('title');
  resize();
  requestAnimationFrame((t) => { last = t; frame(t); });

  // Read-only peek at the game state (handy for testing / curious players)
  window.CheekyPete = {
    CATCHPHRASES, CONFIG, CHAT,
    snapshot() {
      const v = levelSpeed();
      return {
        phase: S.phase, score: S.score, combo: S.combo, maxCombo: S.maxCombo, lives: S.lives,
        level: S.level, levelHits: S.levelHits, levelTarget: CONFIG.levelTarget(S.level),
        levelUpActive: S.levelUpTimer > 0, letters: S.letters.slice(), lanes: S.lanes, best: S.best,
        stats: Object.assign({}, S.stats), speed: v, fever: S.fever, feverActive: S.feverTime > 0,
        viewers: Math.round(S.viewers),
        tiles: S.tiles.map((t) => ({ lane: t.lane, letter: t.letter, kind: t.kind, p: t.p, judged: t.judged, off: timeOff(t, v) })),
        bubble: { text: el.bubbleText.textContent, kind: bubbleKind, visible: bubbleTimer > 0 },
        cheering: el.peteReact.classList.contains('cheer'),
        pete: Pete.state(),
      };
    },
    // Practice helper: skip ahead a level (used by the automated test).
    skipLevel() { if (S.phase === 'playing') { S.tiles = []; startLevelUp(); } },
    // Make Pete pull a face (for testing / fun): talk, hit, miss, bomb, cheer, tap
    pete(action) { if (Pete[action] && action !== 'render' && action !== 'update') Pete[action](1); },
  };
})();
