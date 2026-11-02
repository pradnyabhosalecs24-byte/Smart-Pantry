"""Films the promo with time slowed down inside the page, so a slow machine still yields smooth 30 fps footage.
Each screenshot is stamped with the page's (slowed) time; assemble.py turns the stamps into frame durations.
Usage: python3 film2.py [scene ...]"""
import base64, json, math, os, shutil, sys, time, uuid
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 1280, 720
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# Virtual time: performance.now, rAF timestamps and Date run at window.__speed (1 = normal).
TIME_WARP = """(() => {
  const realNow = performance.now.bind(performance), realDate = Date.now;
  let speed = 1, baseReal = realNow(), baseVirt = baseReal;
  const vnow = () => baseVirt + (realNow() - baseReal) * speed;
  performance.now = vnow;
  const d0 = realDate() - realNow();
  Date.now = () => d0 + vnow();
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(() => cb(vnow()));
  window.__vnow = vnow;
  window.__setSpeed = (s) => { baseVirt = vnow(); baseReal = realNow(); speed = s; window.__speedVal = s; };
})();"""
SYNC_CSS = """() => { const s = window.__speedVal ?? 1; for (const a of document.getAnimations()) if (a.playbackRate !== s) a.playbackRate = s; return window.__vnow(); }"""
CAPTION_JS = """([title, sub]) => {
  let el = document.getElementById('promo-cap');
  if (!el) { el = document.createElement('div'); el.id = 'promo-cap'; el.setAttribute('translate','no'); document.body.appendChild(el); }
  el.style.cssText = 'position:fixed;left:40px;bottom:36px;z-index:99999;max-width:780px;padding:16px 22px;border-radius:16px;background:rgba(20,40,28,.9);color:#fff;font-family:var(--font-sans);box-shadow:0 10px 30px rgba(0,0,0,.25)';
  el.innerHTML = '<div style="font-size:30px;font-weight:700;line-height:1.15">'+title+'</div>' + (sub ? '<div style="margin-top:6px;font-size:19px;opacity:.88">'+sub+'</div>' : '');
}"""
NO_CHROME = """() => { const s = document.createElement('style'); s.textContent = '[data-sonner-toaster]{display:none!important} *{caret-color:transparent!important}'; document.head.appendChild(s); }"""


class Film:
    def __init__(self, page, name, speed):
        self.p, self.name, self.dir = page, name, os.path.join(OUT, "frames", name)
        shutil.rmtree(self.dir, ignore_errors=True)
        os.makedirs(self.dir)
        self.cdp = page.context.new_cdp_session(page)
        self.stamps = []
        page.evaluate(f"() => window.__setSpeed({speed})")
        self.t0 = page.evaluate(SYNC_CSS)

    def t(self):
        """Seconds of film time elapsed (page time)."""
        return (self.p.evaluate("() => window.__vnow()") - self.t0) / 1000

    def shoot(self):
        v = self.p.evaluate(SYNC_CSS)
        data = self.cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 92, "optimizeForSpeed": True})["data"]
        i = len(self.stamps)
        with open(os.path.join(self.dir, f"{i:04d}.jpg"), "wb") as fh:
            fh.write(base64.b64decode(data))
        self.stamps.append((v - self.t0) / 1000)

    def run(self, seconds, each=None):
        """Shoot until `seconds` of film time have passed; `each(t)` drives the mouse/keyboard by film time."""
        while True:
            t = self.t()
            if t >= seconds:
                break
            if each:
                each(t)
            self.shoot()

    def done(self, length):
        self.p.evaluate("() => window.__setSpeed(1)")
        json.dump({"stamps": self.stamps, "length": length}, open(os.path.join(self.dir, "stamps.json"), "w"))
        print(self.name, len(self.stamps), "frames", flush=True)


def sweep(page, cx, cy, rx, ry, period, phase=0):
    return lambda t: page.mouse.move(cx + rx * math.sin((t + phase) * 2 * math.pi / period), cy + ry * math.sin((t + phase) * 2 * math.pi / period * 0.7))


def main(only):
    scene = lambda n: not only or n in only
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=ARGS)

        if scene("s1"):
            c = b.new_context(viewport={"width": W, "height": H}); c.add_init_script(TIME_WARP)
            p = c.new_page(); p.goto(BASE + "/welcome"); p.wait_for_selector("canvas"); time.sleep(4); p.evaluate(NO_CHROME)
            p.add_style_tag(content="main section ~ section, section + section { visibility: hidden }")
            p.mouse.move(640, 330)
            p.evaluate(CAPTION_JS, ["Smart Pantry", "Know what's in your kitchen — and what to use first"])
            f = Film(p, "s1", 1 / 45); f.run(5.5, sweep(p, 900, 330, 260, 110, 5.5)); f.done(5.5)
            c.close()

        if only and not (only - {"s1"}):
            return b.close()
        c = b.new_context(viewport={"width": W, "height": H}); c.add_init_script(TIME_WARP)
        p = c.new_page()
        p.goto(BASE + "/register")
        p.get_by_label("Name").fill("Pradnya")
        p.get_by_label("Email").fill(f"promo-{uuid.uuid4().hex[:6]}@example.com")
        p.get_by_label("Password", exact=True).fill("pantry123")
        p.get_by_label("Confirm password").fill("pantry123")
        p.get_by_role("button", name="Create account").click()
        p.get_by_role("button", name="Try with demo data").click(timeout=60000)
        p.wait_for_selector("text=Use these first", timeout=60000)

        if scene("s2"):
            p.goto(BASE + "/"); p.wait_for_selector("canvas"); time.sleep(5); p.evaluate(NO_CHROME)
            p.evaluate(CAPTION_JS, ["Every jar is a real item", "Fill shows shelf life left · colour shows status"])
            f = Film(p, "s2", 1 / 45); f.run(5.5, sweep(p, 1020, 250, 220, 90, 5.5)); f.done(5.5)

        if scene("s3"):
            p.goto(BASE + "/"); p.wait_for_selector("text=Use these first"); p.evaluate(NO_CHROME)
            p.get_by_role("button", name="Add item").first.click()
            box = p.get_by_label("Quick add: type or say it"); box.click(); time.sleep(0.6)
            p.evaluate(CAPTION_JS, ["Add in seconds", "Type it or say it — or scan the barcode"])
            text = "2 kg potatoes expiring Friday"
            typed = [0]
            filled = [False]

            def drive(t):
                want = min(len(text), max(0, int((t - 0.4) / 0.07)))
                while typed[0] < want:
                    p.keyboard.type(text[typed[0]]); typed[0] += 1
                if t > 0.4 + len(text) * 0.07 + 0.4 and not filled[0]:
                    p.get_by_role("button", name="Fill", exact=True).click(); filled[0] = True

            f = Film(p, "s3", 1 / 40); f.run(5.0, drive); f.done(5.0)
            p.keyboard.press("Escape")

        if scene("s4"):
            p.goto(BASE + "/recipes/library/jeera-aloo"); p.wait_for_selector("text=Start cook-along"); p.evaluate(NO_CHROME)
            p.evaluate("() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; }")
            p.get_by_role("button", name="Start cook-along").click(); p.wait_for_selector("text=Step 1 of")
            p.keyboard.press("ArrowRight"); time.sleep(0.5)
            p.evaluate(CAPTION_JS, ["Recipes for what's expiring", "Exact quantities · animated, narrated cook-along"])
            moved = [False]

            def nxt(t):
                if t > 2.8 and not moved[0]:
                    p.keyboard.press("ArrowRight"); moved[0] = True

            f = Film(p, "s4", 1 / 6); f.run(5.5, nxt); f.done(5.5)
            p.keyboard.press("Escape")

        if scene("s5"):
            # Earn real points first (demo data never counts): add two items and use them before they expire
            hdr = {"X-Requested-With": "SmartPantry", "Content-Type": "application/json"}
            cats = p.request.get(BASE + "/api/categories").json()["categories"]
            locs = p.request.get(BASE + "/api/locations").json()["locations"]
            dairy = next(c["id"] for c in cats if c["name"] == "Dairy"); fridge = next(l["id"] for l in locs if l["name"] == "Refrigerator")
            import datetime as dt
            today = dt.date.today(); d = lambda n: (today + dt.timedelta(days=n)).isoformat()
            for name in ["Fresh Paneer", "Buttermilk"]:
                it = p.request.post(BASE + "/api/items", headers=hdr, data=json.dumps({"name": name, "categoryId": dairy, "locationId": fridge, "unit": "pcs", "quantity": 4, "expiryDate": d(1), "purchaseDate": d(0)})).json()["item"]
                p.request.post(BASE + f"/api/items/{it['id']}/consume", headers=hdr, data=json.dumps({"quantity": 1}))
            p.goto(BASE + "/rewards"); p.wait_for_selector("text=Kitchen streak"); time.sleep(3); p.evaluate(NO_CHROME)
            p.evaluate("() => window.scrollTo(0, 330)"); time.sleep(1.5)
            p.evaluate(CAPTION_JS, ["Wasting less becomes a game", "Points, levels, streaks, badges and weekly challenges"])
            p.evaluate("() => { const c = document.getElementById('promo-cap'); c.style.left = 'auto'; c.style.right = '40px'; c.style.bottom = '36px'; }")
            f = Film(p, "s5", 1 / 8); f.run(5.0, sweep(p, 760, 470, 420, 40, 5)); f.done(5.0)

        if scene("s6"):
            p.goto(BASE + "/"); p.wait_for_selector("canvas"); time.sleep(4); p.evaluate(NO_CHROME)
            p.locator("header select").select_option("hi"); time.sleep(1.5)
            p.evaluate(CAPTION_JS, ["English · हिन्दी · ಕನ್ನಡ", "One pantry for the whole family · alerts on every phone"])
            switched = [False]

            def lang(t):
                sweep(p, 1020, 250, 200, 80, 6)(t)
                if t > 2.6 and not switched[0]:
                    p.locator("header select").select_option("kn"); switched[0] = True

            f = Film(p, "s6", 1 / 45); f.run(5.2, lang); f.done(5.2)
            p.locator("header select").select_option("en")
        b.close()


if __name__ == "__main__":
    main(set(sys.argv[1:]))
