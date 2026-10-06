import numpy as np
import librosa, base64, json

MP3  = r"C:\Users\Administrator\Desktop\剪辑\数字艺术\20261006\The Sun Station - Andrew Prahlow.mp3"
OUT  = r"C:\Users\Administrator\Desktop\剪辑\数字艺术\20261006\tools\features.json"
SR   = 22050
FPS  = 30.0
NBANDS = 28          # vertical rows: low -> high == bottom -> top
NFFT = 2048

y, sr = librosa.load(MP3, sr=SR, mono=True)
dur = float(len(y) / sr)
hop = int(round(sr / FPS))

S = np.abs(librosa.stft(y, n_fft=NFFT, hop_length=hop, window="hann"))
freqs = librosa.fft_frequencies(sr=sr, n_fft=NFFT)          # (F,)
n_frames = S.shape[1]
times = librosa.frames_to_time(np.arange(n_frames), sr=sr, hop_length=hop)

# --- log-spaced frequency bands over [35, 12000] Hz ---
fmin, fmax = 35.0, 12000.0
edges = np.geomspace(fmin, fmax, NBANDS + 1)
db = librosa.amplitude_to_db(S, ref=np.max)                  # (F, T)
bands = np.zeros((NBANDS, n_frames), dtype=np.float32)
for b in range(NBANDS):
    lo, hi = edges[b], edges[b + 1]
    sel = (freqs >= lo) & (freqs < hi)
    if not sel.any():
        # nearest bin fallback for empty band
        idx = int(np.argmin(np.abs(freqs - np.sqrt(lo * hi))))
        bands[b] = db[idx]
    else:
        bands[b] = db[sel].mean(axis=0)

# per-band floor/ceiling -> 0..1 -> 0..255 (dB span 80)
floor_db = np.percentile(bands, 3, axis=1, keepdims=True)
band_db = np.clip((bands - floor_db) / 80.0, 0, 1)
band_db = np.clip(band_db, 0, 1)
# gentle per-band gain so quiet highs still show, without killing dynamics
hi_boost = np.linspace(1.0, 1.35, NBANDS)[:, None]
band_u8 = np.clip(band_db * hi_boost, 0, 1)

def norm_i(arr, pctl=98):
    a = np.asarray(arr, dtype=np.float64)
    hi = np.percentile(a, pctl)
    if hi <= 1e-9: hi = a.max() + 1e-9
    return np.clip(a / hi, 0, 1)

rms   = librosa.feature.rms(y=y, hop_length=hop)[0][:n_frames]
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)[:n_frames]
cent  = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop)[0][:n_frames]
rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, hop_length=hop)[0][:n_frames]
flux  = np.maximum(0, np.diff(band_u8, axis=1)).sum(axis=1)   # temporal spectral flux
flux  = np.concatenate([[0.0], flux])[:n_frames]

low_e  = band_db[0:6].sum(axis=0)
high_e = band_db[-10:].sum(axis=0)
lowhigh = np.clip((low_e - high_e) / (low_e + high_e + 1e-9), -1, 1)

tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, units="frames")
beat_frames = np.clip(np.round(beats).astype(int), 0, n_frames - 1)
beat_impulse = np.zeros(n_frames, dtype=np.float32)
beat_impulse[beat_frames] = 1.0
# exp-decay pulse envelope synced to beats (drums feel)
decay = float(np.exp(-1.0 / (FPS * 0.18)))
pulse = np.zeros(n_frames, dtype=np.float32)
for i in range(n_frames):
    prev = pulse[i - 1] * decay if i > 0 else 0.0
    pulse[i] = 1.0 if beat_impulse[i] > 0 else prev

R = lambda a: np.clip(np.rint(a*255), 0, 255).astype(np.uint8)

feat = {
    "fps": FPS,
    "nframes": int(n_frames),
    "nbands": NBANDS,
    "duration": dur,
    "tempo": float(np.atleast_1d(tempo)[0]),
    "bands_b64": base64.b64encode(R(band_u8).tobytes()).decode("ascii"),  # order: band-major (NBANDS*nframes)
    "rms": R(norm_i(rms)).tolist(),
    "onset": R(norm_i(onset)).tolist(),
    "flux": R(norm_i(flux)).tolist(),
    "cent": R(norm_i(cent)).tolist(),
    "roll": R(norm_i(rolloff, 98)).tolist(),
    "lowhigh": R((lowhigh + 1) / 2).tolist(),
    "pulse": R(norm_i(pulse, 99)).tolist(),
    "beats": [float(times[i]) for i in beat_frames],
    "band_edges_hz": [float(x) for x in edges],
}

with open(OUT, "w") as f:
    json.dump(feat, f, separators=(",", ":"))

import os
print("WROTE", OUT, "bytes", os.path.getsize(OUT))
print("nframes %d nbands %d dur %.2f tempo %.1f" % (n_frames, NBANDS, dur, feat["tempo"]))
print("bands_u8 range", band_u8.min(), band_u8.max())
