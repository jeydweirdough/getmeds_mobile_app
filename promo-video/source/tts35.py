# Voice-over for the 35 s cut. "Getmeds" is always voiced as "GET MEDZ" (phoneme override).
import soundfile as sf, json, sys
from kokoro_onnx import Kokoro
k = Kokoro("models/kokoro-v1.0.onnx", "models/voices-v1.0.bin")
lines = {
 "v1": "When every moment matters, access to medicines matters.",
 "v2": "Meet Get Meds. Your compassionate health ally.",
 "v3": "From essential treatments to specialized therapies, including cancer medicines.",
 "v4": "Get Meds connects patients and healthcare providers with medicines that matter.",
 "v5": "Search any brand, generic, or condition, in seconds.",
 "v6": "Browse by category, and pick the exact strength you need.",
 "v7": "Add it to your list, and send an inquiry in one tap.",
 "v8": "Need help? Chat with Maria, any time.",
 "v9": "Explore a smarter way to discover, request, and access medicines across the Philippines.",
 "v10": "Get Meds. Better access. More possibilities.",
}
only = sys.argv[1:]
speed = {"v9": 1.12, "v4": 1.1}
dur = {}
try: dur = json.load(open("audio35/durations.json"))
except Exception: pass
for key, text in lines.items():
    if only and key not in only: continue
    ph = k.tokenizer.phonemize(text, "en-us").replace("ɡɛt mˈɛdz", "ɡˈɛt mˈɛdz")
    if "Get Meds" in text: assert "ɡˈɛt mˈɛdz" in ph, ph
    s, sr = k.create(ph, voice="af_heart", speed=speed.get(key, 1.08), is_phonemes=True)
    sf.write(f"audio35/vo_{key}.wav", s, sr)
    dur[key] = round(len(s) / sr, 3)
    print(key, dur[key])
json.dump(dur, open("audio35/durations.json", "w"), indent=1)
