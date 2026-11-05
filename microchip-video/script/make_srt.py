"""Write captions.srt from transcript.json (Kokoro word timings), for uploads that take a sidecar.

Lines break at sentence ends, at pauses of 0.3 s or more, or at about 42 characters.
Usage:  python3 script/make_srt.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
words = json.loads((ROOT / "transcript.json").read_text())


def ts(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


cues, cur = [], []
for i, w in enumerate(words):
    cur.append(w)
    text = " ".join(x["text"] for x in cur)
    nxt = words[i + 1] if i + 1 < len(words) else None
    end_sentence = w["text"][-1] in ".?!:"
    pause = nxt is not None and nxt["start"] - w["end"] >= 0.3
    long = nxt is not None and len(text) + 1 + len(nxt["text"]) > 42
    if nxt is None or end_sentence or long or (pause and len(text) > 18):
        cues.append((cur[0]["start"], cur[-1]["end"], text))
        cur = []

out = []
for n, (a, b, text) in enumerate(cues, 1):
    nxt = cues[n][0] if n < len(cues) else b + 1
    out.append(f"{n}\n{ts(a)} --> {ts(min(b + 0.15, nxt - 0.02))}\n{text}\n")
(ROOT / "captions.srt").write_text("\n".join(out))
print(f"{len(cues)} cues")
