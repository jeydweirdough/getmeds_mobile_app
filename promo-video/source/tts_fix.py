# Re-voice the two lines that say the brand name, with "Getmeds" forced to "GET MEDZ".
import soundfile as sf, json
from kokoro_onnx import Kokoro
k = Kokoro("models/kokoro-v1.0.onnx", "models/voices-v1.0.bin")
lines = {"l2": "Meet Get Meds. Your compassionate health ally.", "l8": "Get Meds. Download it today."}
dur = json.load(open("audio/vo_durations.json"))
for key, text in lines.items():
    ph = k.tokenizer.phonemize(text, "en-us").replace("ɡɛt mˈɛdz", "ɡˈɛt mˈɛdz")
    assert "ɡˈɛt mˈɛdz" in ph, ph
    samples, sr = k.create(ph, voice="af_heart", speed=1.08, is_phonemes=True)
    sf.write(f"audio/vo_{key}.wav", samples, sr)
    dur[key] = round(len(samples) / sr, 3)
    print(key, dur[key], ph.encode("ascii", "backslashreplace").decode())
json.dump(dur, open("audio/vo_durations.json", "w"), indent=1)
