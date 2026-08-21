#!/usr/bin/env python3
"""Generate subtle paper/card table sounds for Deckd.

Pure-stdlib WAV synthesis (no numpy / audio deps). Outputs 16-bit mono
22050 Hz WAVs sized for quick loading and low-latency playback:

  deal.wav     0.16s  lowpassed noise swish  (cards leaving the deck)
  flip.wav     0.10s  paper snap             (band-ish noise burst)
  discard.wav  0.13s  soft tap               (low sine thump + noise tick)
  pass.wav     0.20s  gentle whoosh           (soft noise swell)
  win.wav      0.70s  quiet 3-note chime      (C5-E5-G5 arpeggio)

All peaks are normalized to ~0.4-0.5 so the app's low player volumes
(0.25-0.35) stay subtle and physical, never arcade.

Usage:  python scripts/generate-table-sounds.py
Output: assets/sounds/*.wav  (overwrites)
"""

import math
import os
import random
import struct
import wave

SR = 22050
OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "assets", "sounds"))


def write_wav(name: str, samples: list[float]) -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    frames = b"".join(
        struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples
    )
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)
    print(f"{name}: {len(samples) / SR:.2f}s peak={max(abs(s) for s in samples):.3f} -> {path}")


def envelope(n: int, attack: int, release: int) -> list[float]:
    """Linear attack/release envelope (sample counts)."""
    out = []
    for i in range(n):
        a = min(1.0, i / attack) if attack > 0 else 1.0
        r = min(1.0, (n - i) / release) if release > 0 else 1.0
        out.append(a * r)
    return out


def lowpass(samples: list[float], alpha: float) -> list[float]:
    """One-pole lowpass. alpha ~ cutoff (0..1); smaller = darker."""
    out = []
    prev = 0.0
    for s in samples:
        prev += alpha * (s - prev)
        out.append(prev)
    return out


def noise(n: int, seed: int) -> list[float]:
    rng = random.Random(seed)
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


def normalize(samples: list[float], peak: float) -> list[float]:
    m = max(abs(s) for s in samples) or 1.0
    return [s * peak / m for s in samples]


def sine(freq: float, n: int, phase: float = 0.0) -> list[float]:
    return [math.sin(2 * math.pi * freq * i / SR + phase) for i in range(n)]


def exp_decay(n: int, tau: float) -> list[float]:
    """Exponential decay envelope, tau in seconds."""
    return [math.exp(-i / (tau * SR)) for i in range(n)]


def make_deal() -> list[float]:
    """Swish: dark lowpassed noise with a quick attack and long tail."""
    n = int(0.16 * SR)
    s = lowpass(noise(n, seed=11), 0.22)
    env = envelope(n, attack=int(0.006 * SR), release=int(0.13 * SR))
    return normalize([a * e for a, e in zip(s, env)], 0.5)


def make_flip() -> list[float]:
    """Snap: bright noise burst (noise minus its lowpass = highpass-ish)."""
    n = int(0.10 * SR)
    raw = noise(n, seed=22)
    s = [a - b for a, b in zip(raw, lowpass(raw, 0.35))]
    env = envelope(n, attack=int(0.002 * SR), release=int(0.085 * SR))
    return normalize([a * e for a, e in zip(s, env)], 0.5)


def make_discard() -> list[float]:
    """Soft tap: low sine thump with a tiny noise tick on top."""
    n = int(0.13 * SR)
    thump = [a * e for a, e in zip(sine(170.0, n), exp_decay(n, 0.045))]
    tick_n = int(0.004 * SR)
    tick = lowpass(noise(tick_n, seed=33), 0.3)
    tick = tick + [0.0] * (n - tick_n)
    s = [0.55 * a + 0.45 * b for a, b in zip(thump, tick)]
    return normalize(s, 0.5)


def make_pass() -> list[float]:
    """Whoosh: soft noise swell, darker and gentler than the deal."""
    n = int(0.20 * SR)
    s = lowpass(noise(n, seed=44), 0.14)
    env = envelope(n, attack=int(0.03 * SR), release=int(0.15 * SR))
    return normalize([a * e for a, e in zip(s, env)], 0.4)


def make_win() -> list[float]:
    """Chime: C5-E5-G5 arpeggio, each note a sine with a soft 2nd harmonic."""
    n = int(0.70 * SR)
    notes = [(523.25, 0.0, 0.5), (659.25, 0.09, 0.4), (783.99, 0.18, 0.5)]
    s = [0.0] * n
    for freq, start, amp in notes:
        start_i = int(start * SR)
        length = n - start_i
        note = sine(freq, length) + [0.3 * math.sin(2 * math.pi * 2 * freq * i / SR) for i in range(length)]
        decay = exp_decay(length, 0.20)
        for i in range(length):
            s[start_i + i] += amp * note[i] * decay[i]
    return normalize(s, 0.4)


def main() -> None:
    write_wav("deal.wav", make_deal())
    write_wav("flip.wav", make_flip())
    write_wav("discard.wav", make_discard())
    write_wav("pass.wav", make_pass())
    write_wav("win.wav", make_win())
    print("Done. Verify: python -c \"import wave; ...\" or listen in the app.")


if __name__ == "__main__":
    main()
