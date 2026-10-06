import base64, json, os

ROOT = r"C:\Users\Administrator\Desktop\剪辑\数字艺术\20261006"
TPL  = os.path.join(ROOT, "tools", "template.html")
MP3  = os.path.join(ROOT, "The Sun Station - Andrew Prahlow.mp3")
FEAT = os.path.join(ROOT, "tools", "features.json")
OUT  = os.path.join(ROOT, "太阳站-ASCII舷窗.html")

tpl    = open(TPL, encoding="utf-8").read()
feat   = open(FEAT, encoding="utf-8").read()
featd  = json.loads(feat)
audio  = base64.b64encode(open(MP3, "rb").read()).decode("ascii")

html = (tpl
        .replace("__FEATURES_JSON__", feat)
        .replace("__AUDIO_B64__", audio)
        .replace("__DURATION__", "%.3f" % featd["duration"]))

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print("WROTE", OUT)
print("bytes", os.path.getsize(OUT), "audio_kb", len(audio) // 1024, "feat_kb", len(feat) // 1024)
