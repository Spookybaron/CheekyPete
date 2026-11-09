/* =========================================================================
   CHEEKY PETE - a neon rhythm-typing game
   Plain JavaScript, no dependencies. Open index.html to play.
   ========================================================================= */
(function () {
  'use strict';

  /* =======================================================================
     CATCHPHRASES  <-- edit this list to change what Pete says.
     -----------------------------------------------------------------------
     good : said on combo milestones, level ups and (sometimes) good hits
     miss : said when you miss a tile or press the wrong key
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
  };

  /* ---------------- Game tuning ---------------- */
  const CONFIG = {
    lanes: 3,                     // 3 or 4 lanes
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
    bestKey: 'cheekyPete.best',
  };

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const canvas = $('lanes');
  const ctx = canvas.getContext('2d');
  const el = {
    score: $('score'), combo: $('combo'), lives: $('lives'), level: $('level'),
    levelFill: $('levelFill'), bubble: $('bubble'), bubbleText: $('bubbleText'),
    peteReact: $('peteReact'), peteWrap: $('peteWrap'), touchPad: $('touchPad'),
    titleBest: $('titleBest'), finalScore: $('finalScore'), finalBest: $('finalBest'),
    finalLevel: $('finalLevel'), finalStats: $('finalStats'), newBest: $('newBest'),
    levelUp: $('levelUp'), levelUpNum: $('levelUpNum'), levelUpKeys: $('levelUpKeys'),
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
    letters: CONFIG.firstLetters.slice(0, CONFIG.lanes),
    tiles: [], effects: [], spawnTimer: 0.6, time: 0,
    stats: { perfect: 0, good: 0, miss: 0 },
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
    miss: () => { beep(140, 0.18, 'sawtooth', 0.05); beep(100, 0.2, 'sawtooth', 0.04, 0.05); },
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
  }
  function hideBubble(instant) {
    bubbleTimer = 0; bubbleKind = null;
    el.bubble.classList.remove('show');
    if (instant) el.bubble.classList.remove('hide'); else el.bubble.classList.add('hide');
  }

  /* ---------------- Pete reactions ---------------- */
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
  }
  function stopCheer() {
    el.peteReact.classList.remove('cheer');
    el.peteWrap.classList.remove('cheering');
  }

  /* ---------------- Lanes / letters ---------------- */
  function pickLetters(level) {
    if (level === 1) return CONFIG.firstLetters.slice(0, CONFIG.lanes);
    const pool = (level <= 3 ? CONFIG.easyLetters : CONFIG.allLetters).split('');
    let out;
    do {
      out = [];
      const p = pool.slice();
      for (let i = 0; i < CONFIG.lanes; i++) out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
    } while (out.join('') === S.letters.join(''));
    return out;
  }
  function buildTouchPad() {
    el.touchPad.innerHTML = '';
    for (let i = 0; i < CONFIG.lanes; i++) {
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
      stats: { perfect: 0, good: 0, miss: 0 },
    });
    S.letters = pickLetters(1);
    updateTouchLabels();
    hideBubble(true);
    el.peteReact.classList.remove('happy', 'shake');
    stopCheer();
    cheerTimer = 0; lastLine = null;
    setPhase('playing');
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

  // Ignore restart presses for a moment so a panicked key-mash doesn't skip the results screen
  function canRestart() {
    return S.phase === 'over' && performance.now() - S.overAt > 600;
  }

  function gameOver() {
    const isNew = S.score > S.best;
    if (isNew) { S.best = S.score; saveBest(S.best); }
    el.finalScore.textContent = S.score;
    el.finalBest.textContent = S.best;
    el.finalLevel.textContent = S.level;
    el.newBest.classList.toggle('on', isNew && S.score > 0);
    el.finalStats.innerHTML = 'PERFECT ' + S.stats.perfect + ' &middot; GOOD ' + S.stats.good +
      ' &middot; MISS ' + S.stats.miss + '<br>BEST COMBO ' + S.maxCombo;
    S.overAt = performance.now();
    setPhase('over');
    sfx.over();
  }

  function startLevelUp() {
    S.level += 1;
    S.levelHits = 0; S.levelTime = 0; S.levelDone = false;
    S.lives = Math.min(CONFIG.lives, S.lives + 1);
    const bonus = CONFIG.levelBonus * (S.level - 1);
    S.score += bonus;
    S.letters = pickLetters(S.level);
    updateTouchLabels();
    S.levelUpTimer = CONFIG.levelUpPause;
    S.spawnTimer = 0.4;
    el.levelUpNum.textContent = 'LEVEL ' + S.level;
    el.levelUpKeys.innerHTML = 'NEW KEYS: ' + S.letters.join(' ') + '<br><span class="yellow">BONUS +' + bonus + '</span>';
    el.levelUp.classList.remove('show'); void el.levelUp.offsetWidth; el.levelUp.classList.add('show');
    cheer(2.4);
    say('good');
    sfx.levelUp();
    updateHud();
  }

  /* ---------------- Judging ---------------- */
  function timeOff(tile, speed) { return (tile.p - CONFIG.hitP) / speed; } // + = late

  function tryHit(candidates, lane) {
    const v = levelSpeed();
    let best = null, bestAbs = Infinity;
    for (const t of candidates) {
      const a = Math.abs(timeOff(t, v));
      if (a < bestAbs) { bestAbs = a; best = t; }
    }
    if (best && bestAbs <= CONFIG.goodWindow) {
      const grade = bestAbs <= CONFIG.perfectWindow ? 'PERFECT' : 'GOOD';
      registerHit(best, grade);
    } else {
      registerMiss(lane, 'wrong');
    }
  }

  function pressLetter(letter) {
    const lane = S.letters.indexOf(letter);
    if (lane >= 0) S.laneFlash[lane] = 0.12;
    const cands = S.tiles.filter((t) => !t.judged && t.letter === letter);
    tryHit(cands, lane);
  }
  function pressLane(lane) {
    S.laneFlash[lane] = 0.12;
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
    S.score += CONFIG.points[grade] * mult;
    S.stats[grade === 'PERFECT' ? 'perfect' : 'good'] += 1;
    S.levelHits += 1;
    laneText(tile.lane, grade, grade === 'PERFECT' ? '#ffe14a' : '#39ff6a');
    S.effects.push({ type: 'burst', lane: tile.lane, t: 0, life: 0.3, color: CONFIG.laneColors[tile.lane] });
    sfx.hit(tile.lane, grade === 'PERFECT');
    react('happy');
    const milestone = CONFIG.comboMilestones.includes(S.combo) || (S.combo > 100 && S.combo % 25 === 0);
    if (milestone) {
      say('good');
      S.effects.push({ type: 'text', text: S.combo + ' COMBO!', lane: -1, t: 0, life: 1.0, color: '#ff2bd6' });
    } else if (bubbleTimer <= 0 && Math.random() < CONFIG.goodBubbleChance) {
      say('good');
    }
    if (S.combo % 50 === 0) S.lives = Math.min(CONFIG.lives, S.lives + 1);
    if (S.levelHits >= CONFIG.levelTarget(S.level)) S.levelDone = true;
    updateHud();
  }

  function registerMiss(lane, why) {
    S.combo = 0;
    S.lives -= 1;
    S.stats.miss += 1;
    laneText(lane, why === 'wrong' ? 'WRONG!' : 'MISS', '#ff3b3b');
    S.effects.push({ type: 'flash', t: 0, life: 0.25 });
    sfx.miss();
    react('shake');
    // Always react to a miss, but don't flicker if misses come thick and fast
    if (!(bubbleKind === 'miss' && S.time - lastMissBubbleAt < 0.7)) say('miss');
    updateHud();
    if (S.lives <= 0) gameOver();
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    el.score.textContent = S.score;
    el.combo.textContent = '\u00d7' + S.combo;
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
  }

  /* ---------------- Update loop ---------------- */
  function update(dt) {
    S.time += dt;
    for (let i = 0; i < CONFIG.lanes; i++) S.laneFlash[i] = Math.max(0, (S.laneFlash[i] || 0) - dt);

    if (S.levelUpTimer > 0) {
      S.levelUpTimer -= dt;
    } else {
      S.levelTime += dt;
      // Only send as many tiles as the level still needs (a miss lets another one through)
      const pending = S.tiles.filter((t) => !t.judged).length;
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
        t.judged = 'miss';
        registerMiss(t.lane, 'late');
        if (S.phase !== 'playing') return;
      }
    }
    S.tiles = S.tiles.filter((t) => t.p < 1.15 && !(t.judged === 'hit'));

    // Level cleared: wait for the screen to empty, then celebrate
    if (S.levelDone && S.levelUpTimer <= 0 && !S.tiles.some((t) => !t.judged)) startLevelUp();
  }

  let lastLane = -1;
  function spawnTile() {
    let lane = Math.floor(Math.random() * CONFIG.lanes);
    if (lane === lastLane && Math.random() < 0.5) lane = (lane + 1 + Math.floor(Math.random() * (CONFIG.lanes - 1))) % CONFIG.lanes;
    lastLane = lane;
    S.tiles.push({ lane, letter: S.letters[lane], p: -0.08, judged: null });
  }

  function tickUi(dt) {
    if (bubbleTimer > 0) { bubbleTimer -= dt; if (bubbleTimer <= 0) hideBubble(); }
    if (reactTimer > 0) { reactTimer -= dt; if (reactTimer <= 0) el.peteReact.classList.remove('happy', 'shake'); }
    if (cheerTimer > 0) { cheerTimer -= dt; if (cheerTimer <= 0) stopCheer(); }
    for (const e of S.effects) e.t += dt;
    S.effects = S.effects.filter((e) => e.t < e.life);
  }

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
  function edgeX(g, e, p) { const w = widthAt(g, p); return g.cx - w / 2 + (e / CONFIG.lanes) * w; }
  function laneCenter(g, lane, p) { return (edgeX(g, lane, p) + edgeX(g, lane + 1, p)) / 2; }
  function laneW(g, p) { return widthAt(g, p) / CONFIG.lanes; }

  function font(px) { return px + "px 'Press Start 2P', ui-monospace, monospace"; }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const g = geo();
    const n = CONFIG.lanes;

    // lane backgrounds
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(edgeX(g, i, 0), 0); ctx.lineTo(edgeX(g, i + 1, 0), 0);
      ctx.lineTo(edgeX(g, i + 1, 1), H); ctx.lineTo(edgeX(g, i, 1), H); ctx.closePath();
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(10,6,24,0.2)');
      grd.addColorStop(1, hexA(CONFIG.laneColors[i], 0.07 + (S.laneFlash[i] || 0) * 1.2));
      ctx.fillStyle = grd; ctx.fill();
    }
    // lane lines (neon)
    ctx.lineWidth = 3;
    for (let e = 0; e <= n; e++) {
      const c = CONFIG.laneColors[Math.min(e, n - 1)]; // right-most edge reuses the last lane's colour
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
    ctx.fillText('HIT ZONE', (pl + pr) / 2, py + ph / 2 + 2);

    // falling tiles
    for (const t of S.tiles) {
      if (t.p < -0.1) continue;
      const c = t.judged === 'miss' ? '#ff3b3b' : CONFIG.laneColors[t.lane];
      const w = laneW(g, t.p) * 0.7, h = Math.max(18, w * 0.42);
      const x = laneCenter(g, t.lane, t.p) - w / 2, y = t.p * H - h / 2;
      ctx.globalAlpha = t.judged === 'miss' ? Math.max(0, 0.7 - (t.p - CONFIG.hitP) * 3) : 1;
      ctx.shadowColor = c; ctx.shadowBlur = 16;
      ctx.fillStyle = hexA(c, 0.28); roundRect(x, y, w, h, 5); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = c; ctx.stroke();
      ctx.shadowBlur = 6; ctx.fillStyle = '#ffffff';
      ctx.font = font(Math.round(h * 0.5));
      ctx.fillText(t.letter, x + w / 2, y + h / 2 + 2);
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
      } else if (e.type === 'text') {
        const cx = e.lane >= 0 ? laneCenter(g, e.lane, CONFIG.hitP) : W / 2;
        const y0 = e.lane >= 0 ? hy - rh * 0.9 : H * 0.42;
        ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        ctx.fillStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 12;
        const size = e.lane >= 0 ? Math.max(10, Math.min(18, rw * 0.15)) : Math.max(14, Math.min(28, W * 0.045));
        ctx.font = font(Math.round(size));
        ctx.fillText(e.text, cx, y0 - k * 40);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      } else if (e.type === 'flash') {
        ctx.fillStyle = 'rgba(255,40,60,' + (0.18 * (1 - k)) + ')';
        ctx.fillRect(0, 0, W, H);
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
      else if (canRestart()) startGame();
      else if (S.phase === 'paused') togglePause();
      return;
    }
    if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); togglePause(); return; }
    if (k === 'm' || k === 'M') { S.muted = !S.muted; return; }
    if (e.repeat) return;
    if (S.phase === 'playing' && /^[a-zA-Z]$/.test(k)) { e.preventDefault(); pressLetter(k.toUpperCase()); }
  });

  $('startBtn').addEventListener('click', () => { if (S.phase === 'title') startGame(); });
  $('restartBtn').addEventListener('click', () => { if (canRestart()) startGame(); });
  $('resumeBtn').addEventListener('click', togglePause);
  $('quitBtn').addEventListener('click', () => { S.tiles = []; hideBubble(true); setPhase('title'); });
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
    CATCHPHRASES, CONFIG,
    snapshot() {
      const v = levelSpeed();
      return {
        phase: S.phase, score: S.score, combo: S.combo, maxCombo: S.maxCombo, lives: S.lives,
        level: S.level, levelHits: S.levelHits, levelTarget: CONFIG.levelTarget(S.level),
        levelUpActive: S.levelUpTimer > 0, letters: S.letters.slice(), best: S.best,
        stats: Object.assign({}, S.stats), speed: v,
        tiles: S.tiles.map((t) => ({ lane: t.lane, letter: t.letter, p: t.p, judged: t.judged, off: timeOff(t, v) })),
        bubble: { text: el.bubbleText.textContent, kind: bubbleKind, visible: bubbleTimer > 0 },
        cheering: el.peteReact.classList.contains('cheer'),
      };
    },
  };
})();
