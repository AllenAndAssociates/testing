"""Generate a quiet ambient music bed locally with MusicGen (facebook/musicgen-small).

Writes assets/music/bed_raw.wav (one ~30 s phrase). script/loop_music.sh then
crossfades it into a bed as long as the film.

Usage:  python script/make_music.py   (venv with torch + transformers)
"""

from pathlib import Path

import numpy as np
import scipy.io.wavfile as wav
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

ROOT = Path(__file__).resolve().parent.parent
torch.manual_seed(7)

PROMPT = (
    "calm cinematic ambient electronic underscore for a science documentary, "
    "warm analog synth pads, soft pulsing arpeggio, slow evolving texture, "
    "no drums, no vocals, 90 bpm, hopeful and precise"
)

proc = AutoProcessor.from_pretrained("facebook/musicgen-small")
model = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small")
model.eval()
inputs = proc(text=[PROMPT], padding=True, return_tensors="pt")
# ~50 tokens per second of audio
with torch.inference_mode():
    audio = model.generate(**inputs, do_sample=True, guidance_scale=3.0, max_new_tokens=1500)
sr = model.config.audio_encoder.sampling_rate
x = audio[0, 0].cpu().numpy().astype(np.float32)
x = x / (np.abs(x).max() + 1e-6) * 0.7
out = ROOT / "assets" / "music"
out.mkdir(parents=True, exist_ok=True)
wav.write(out / "bed_raw.wav", sr, x)
print(f"wrote {len(x) / sr:.1f}s at {sr} Hz")
