"""Turns the timed frames into one 30 fps MP4: one encoded file per scene (with its fades), then joined without re-encoding."""
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright

D = os.path.dirname(os.path.abspath(__file__))
SCENES = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"]
FADE = 0.35
BG = "0xF6F3EA"
ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart"]

END_CARD = """<html><body style="margin:0;width:1280px;height:720px;display:flex;align-items:center;justify-content:center;background:#1f5b3a;font-family:'DejaVu Sans',sans-serif;color:#F6F3EA">
<div style="text-align:center">
  <div style="font-size:78px;font-weight:800;letter-spacing:-1px">Smart Pantry</div>
  <div style="margin-top:14px;font-size:30px;opacity:.9">Use food before it's too late.</div>
  <div style="margin-top:44px;display:inline-block;padding:14px 30px;border-radius:14px;background:#F6F3EA;color:#1f5b3a;font-size:26px;font-weight:700">Create your pantry — it's free</div>
</div></body></html>"""


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(r.stderr[-2000:])


def scene_file(name):
    out = os.path.join(D, f"{name}.mp4")
    tmp = os.path.join(D, f"{name}.part.mp4")
    if name == "s7":
        still = os.path.join(D, "endcard.jpg")
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")
            pg = b.new_page(viewport={"width": 1280, "height": 720}); pg.set_content(END_CARD)
            pg.screenshot(path=still, type="jpeg", quality=92); b.close()
        length = 3.5
        vf = f"format=yuv420p,loop=-1:1,trim=duration={length},fade=in:st=0:d={FADE}:color={BG}"
        run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "30", "-i", still, "-vf", vf, *ENC, tmp])
    else:
        meta = json.load(open(os.path.join(D, "frames", name, "stamps.json")))
        st, length = meta["stamps"], meta["length"]
        lst = os.path.join(D, "frames", name, "list.txt")
        with open(lst, "w") as fh:
            for i, t in enumerate(st):
                nxt = st[i + 1] if i + 1 < len(st) else length
                fh.write(f"file '{i:04d}.jpg'\nduration {max(nxt - t, 0.001):.4f}\n")
            fh.write(f"file '{len(st) - 1:04d}.jpg'\n")  # concat demuxer needs the last file repeated
        vf = f"fps=30,format=yuv420p,trim=duration={length},fade=in:st=0:d={FADE}:color={BG},fade=out:st={length - FADE}:d={FADE}:color={BG}"
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-vf", vf, *ENC, tmp])
    os.replace(tmp, out)  # only a finished render gets the real name
    return out


if __name__ == "__main__":
    files = [scene_file(n) for n in (sys.argv[1:] or SCENES)]
    if not sys.argv[1:]:
        with open(os.path.join(D, "concat.txt"), "w") as fh:
            fh.writelines(f"file '{f}'\n" for f in files)
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", os.path.join(D, "concat.txt"), "-c", "copy", "-movflags", "+faststart", os.path.join(D, "promo.part.mp4")])
        os.replace(os.path.join(D, "promo.part.mp4"), os.path.join(D, "promo.mp4"))
        print("promo.mp4 ready")
