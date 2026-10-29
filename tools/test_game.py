import sys, time, subprocess, os
from playwright.sync_api import sync_playwright

GAME = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SHOTS = os.environ.get('SHOTS', os.path.join(GAME, '..', 'shots'))
PORT = 8765
URL = f'http://127.0.0.1:{PORT}/index.html'
GOOD = ["I got it Chat", "I Love You Chat!", "Easy!"]
MISS = ["Boo!", "Help Chat", "Too Fast"]
results = []

def check(name, cond, info=''):
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if info else ''), flush=True)

def snap(page):
    return page.evaluate('CheekyPete.snapshot()')

def wait_tile_in_zone(page, timeout=8000):
    # wait until the earliest unjudged tile is just before / on the hit line
    page.wait_for_function("""() => { const s = CheekyPete.snapshot();
        const t = s.tiles.filter(t => !t.judged).sort((a,b)=>b.p-a.p)[0];
        return s.phase==='playing' && !s.levelUpActive && t && t.off > -0.035 && t.off < 0.04; }""", timeout=timeout, polling='raf')
    s = snap(page)
    return sorted([t for t in s['tiles'] if not t['judged']], key=lambda t: -t['p'])[0]

def run(device, p):
    browser = p.chromium.launch()
    if device == 'phone':
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    else:
        ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    errors, warnings = [], []
    page.on('console', lambda m: (errors if m.type == 'error' else warnings if m.type == 'warning' else []).append(m.text))
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    page.goto(URL)
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(600)
    # record every bubble line said
    page.evaluate("""() => { window.__lines = []; const b = document.getElementById('bubbleText');
        new MutationObserver(() => window.__lines.push([b.textContent, document.getElementById('bubble').dataset.kind])).observe(b, {childList:true, characterData:true, subtree:true}); }""")
    pre = f'{SHOTS}/{device}-'
    s = snap(page)
    check(f'{device}: title screen shown', s['phase'] == 'title' and page.is_visible('#titleScreen'))
    page.screenshot(path=pre + '1-title.png')

    if device == 'phone':
        check('phone: touch buttons visible', page.is_visible('#touchPad'))
        page.tap('#startBtn')
    else:
        check('desktop: touch buttons hidden', not page.is_visible('#touchPad'))
        page.keyboard.press('Space')
    page.wait_for_timeout(100)
    s = snap(page)
    check(f'{device}: game starts', s['phase'] == 'playing' and s['score'] == 0 and s['lives'] == 5 and s['level'] == 1, str(s['letters']))
    if device == 'phone':
        labels = page.eval_on_selector_all('.lane-btn', 'bs => bs.map(b => b.textContent)')
        check('phone: buttons labelled with lane letters', labels == s['letters'], str(labels))

    # ---- hit tiles to clear level 1
    good_shot = False; hits_ok = True; combo_ok = True; grades = []
    target = s['levelTarget']
    for i in range(target):
        t = wait_tile_in_zone(page)
        before = snap(page)
        if device == 'phone':
            page.tap(f'.lane-btn[data-lane="{t["lane"]}"]')
        else:
            page.keyboard.press(t['letter'].lower())
        page.wait_for_timeout(30)
        after = snap(page)
        if not (after['score'] > before['score']): hits_ok = False
        if not (after['combo'] == before['combo'] + 1 or after['levelUpActive']): combo_ok = False
        grades.append(after['stats'])
        b = after['bubble']
        if b['visible'] and b['kind'] == 'good' and not good_shot and not after['levelUpActive']:
            check(f'{device}: good-hit bubble uses a good phrase', b['text'] in GOOD, b['text'])
            page.wait_for_timeout(200)
            page.screenshot(path=pre + '2-good-hit-bubble.png'); good_shot = True
    s = snap(page)
    check(f'{device}: correct presses in zone score', hits_ok, f"score={s['score']}")
    check(f'{device}: combo builds', combo_ok and s['maxCombo'] >= target - 0, f"maxCombo={s['maxCombo']} stats={s['stats']}")
    check(f'{device}: good bubble appeared (combo milestone)', good_shot)

    # ---- level up
    page.wait_for_function('CheekyPete.snapshot().level === 2', timeout=8000)
    page.wait_for_timeout(450)
    s = snap(page)
    check(f'{device}: level up to 2, Pete cheering, HUD shows LV 2', s['level'] == 2 and s['cheering'] and page.inner_text('#level') == 'LV 2' and page.is_visible('#levelUp'), str(s['letters']))
    if device == 'phone':
        labels = page.eval_on_selector_all('.lane-btn', 'bs => bs.map(b => b.textContent)')
        check('phone: buttons relabelled after level up', labels == s['letters'], str(labels))
    page.screenshot(path=pre + '3-level-up.png')
    page.wait_for_function('!CheekyPete.snapshot().cheering', timeout=5000)
    check(f'{device}: Pete returns to normal pose', not snap(page)['cheering'])
    check(f'{device}: level 2 is faster', s['speed'] > 0.36, f"speed={s['speed']:.3f}")

    # ---- build a little combo then wrong key
    for i in range(2):
        t = wait_tile_in_zone(page)
        if device == 'phone': page.tap(f'.lane-btn[data-lane="{t["lane"]}"]')
        else: page.keyboard.press(t['letter'].lower())
    page.wait_for_timeout(30)
    before = snap(page)
    if device == 'phone':
        # tapping a lane with no tile near the zone = miss
        page.wait_for_function("""() => { const s = CheekyPete.snapshot(); return [0,1,2].some(l => !s.tiles.some(t => !t.judged && t.lane===l && Math.abs(t.off) < 0.4)); }""", polling='raf')
        s0 = snap(page)
        lane = [l for l in range(3) if not any((not t['judged']) and t['lane'] == l and abs(t['off']) < 0.4 for t in s0['tiles'])][0]
        page.tap(f'.lane-btn[data-lane="{lane}"]')
    else:
        wrong = next(c for c in 'ZXQV' if c not in before['letters'])
        page.keyboard.press(wrong.lower())
    page.wait_for_timeout(60)
    after = snap(page)
    check(f'{device}: wrong key/tap is a miss and resets combo', after['combo'] == 0 and after['lives'] == before['lives'] - 1 and before['combo'] >= 2,
          f"combo {before['combo']}->{after['combo']} lives {before['lives']}->{after['lives']}")
    b = after['bubble']
    check(f'{device}: miss bubble uses a miss phrase', b['visible'] and b['kind'] == 'miss' and b['text'] in MISS, b['text'])
    page.wait_for_timeout(150)
    page.screenshot(path=pre + '4-miss-bubble.png')

    # ---- pause
    page.keyboard.press('p'); page.wait_for_timeout(50)
    s1 = snap(page); page.wait_for_timeout(400); s2 = snap(page)
    frozen = [t['p'] for t in s1['tiles']] == [t['p'] for t in s2['tiles']]
    check(f'{device}: P pauses (tiles frozen)', s1['phase'] == 'paused' and frozen and page.is_visible('#pauseScreen'))
    page.keyboard.press('Escape'); page.wait_for_timeout(50)
    check(f'{device}: Esc resumes', snap(page)['phase'] == 'playing')

    # ---- let tiles pass -> misses -> game over
    before = snap(page)
    page.wait_for_function(f"CheekyPete.snapshot().stats.miss > {before['stats']['miss']}", timeout=8000)
    after = snap(page)
    check(f'{device}: tile passing the zone is a miss', after['lives'] < before['lives'] and after['combo'] == 0)
    page.wait_for_function("CheekyPete.snapshot().phase === 'over'", timeout=20000)
    s = snap(page)
    page.wait_for_timeout(300)
    final_txt = page.inner_text('#finalScore')
    stored = page.evaluate("localStorage.getItem('cheekyPete.best')")
    check(f'{device}: game over screen with final score', page.is_visible('#overScreen') and final_txt == str(s['score']), f'score={final_txt}')
    check(f'{device}: best score saved', stored == str(s['score']) and s['score'] > 0, f'stored={stored}')
    page.screenshot(path=pre + '5-game-over.png')
    page.wait_for_timeout(700)  # restart is ignored for 0.6s so a frantic key-mash can't skip the screen

    lines = page.evaluate('window.__lines')
    said = [l for l in lines if l[0]]
    dup = any(said[i][0] == said[i + 1][0] for i in range(len(said) - 1))
    kinds_ok = all((k == 'good' and t in GOOD) or (k == 'miss' and t in MISS) for t, k in said)
    check(f'{device}: bubble lines right kind, never same line twice in a row', kinds_ok and not dup and len(said) >= 2, ' | '.join(t for t, k in said))

    # ---- restart
    if device == 'phone': page.tap('#restartBtn')
    else: page.keyboard.press('Enter')
    page.wait_for_timeout(100)
    s = snap(page)
    check(f'{device}: restart works', s['phase'] == 'playing' and s['score'] == 0 and s['lives'] == 5 and s['level'] == 1)

    # ---- best persists after reload
    best = int(stored)
    page.reload(); page.wait_for_timeout(500)
    check(f'{device}: best score persists after reload', page.inner_text('#titleBest') == str(best), page.inner_text('#titleBest'))

    # ---- no scrolling
    sc = page.evaluate('[document.documentElement.scrollHeight, document.documentElement.scrollWidth, innerHeight, innerWidth]')
    check(f'{device}: page does not scroll', sc[0] <= sc[2] and sc[1] <= sc[3], str(sc))

    audio404 = [e for e in errors if '404' in e]
    real = [e for e in errors if '404' not in e]
    check(f'{device}: no console errors', not real, '; '.join(real))
    print(f'  ({device}) 404 resource messages (missing optional audio clips): {len(audio404)}; warnings: {warnings[:3]}')
    browser.close()

if __name__ == '__main__':
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=GAME,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            for d in (sys.argv[1:] or ['desktop', 'phone']):
                try: run(d, p)
                except Exception as e: check(f'{d}: run completed', False, repr(e)[:400])
    finally:
        srv.terminate()
    print(f"\n{sum(r[1] for r in results)}/{len(results)} checks passed")
