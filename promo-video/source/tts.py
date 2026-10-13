import soundfile as sf, json, sys
from kokoro_onnx import Kokoro
k = Kokoro("models/kokoro-v1.0.onnx", "models/voices-v1.0.bin")
voice = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
lines = {
 "l1": "Specialty medicines shouldn't be hard to find.",
 "l2": "Meet Getmeds. Your compassionate health ally.",
 "l3": "Search any brand, generic, or condition, in seconds.",
 "l4": "Browse by category, and pick the exact strength you need.",
 "l5": "Add it to your list, and send an inquiry in one tap.",
 "l6": "Need help? Chat with Maria, any time.",
 "l7": "Licensed, accredited, and delivering nationwide.",
 "l8": "Getmeds. Download it today.",
}
out = {}
for key, text in lines.items():
    samples, sr = k.create(text, voice=voice, speed=1.08, lang="en-us")
    sf.write(f"audio/vo_{key}.wav", samples, sr)
    out[key] = round(len(samples) / sr, 3)
    print(key, out[key], sr)
json.dump(out, open("audio/vo_durations.json", "w"), indent=1)
