import numpy as np
import librosa

MP3 = r"C:\Users\Administrator\Desktop\剪辑\数字艺术\20261006\The Sun Station - Andrew Prahlow.mp3"
SR = 22050
FPS = 30.0

y, sr = librosa.load(MP3, sr=SR, mono=True)
dur = len(y) / sr
print("duration_sec %.3f" % dur)

hop = int(round(sr / FPS))

tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, units="frames")
beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
print("tempo %.2f" % float(np.atleast_1d(tempo)[0]))
print("n_beats %d" % len(beat_times))

rms = librosa.feature.rms(y=y, hop_length=hop)[0]
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)

def at(t, arr):
    idx = min(len(arr) - 1, max(0, int(round(t * FPS))))
    return float(arr[idx])

markers = [0.0, 10.0, 16.0, 25.0, 55.0, 85.0, 113.0, 128.0, 135.0, 145.0, 153.0, 165.0, 180.0, dur - 0.5]
print("t      rms    onset")
for t in markers:
    print("%6.1f  %.3f  %.3f" % (t, at(t, rms), at(t, onset)))

print("per5s_rms")
for i in range(int(dur // 5) + 1):
    a = int(i * 5 * FPS)
    b = int((i + 1) * 5 * FPS)
    seg = rms[a:min(b, len(rms))]
    if len(seg):
        print("%3d-%3ds %.3f" % (i * 5, (i + 1) * 5, float(np.mean(seg))))
