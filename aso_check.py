# ASO validator script
import sys

def validate_length(label, text, max_len):
    char_len = len(text)
    status = "OK" if char_len <= max_len else "EXCEEDED"
    print(f"[{status}] {label}: {char_len}/{max_len} chars -> '{text}'")

tr_names = [
    "LociAR: AR Not Bırak ve Keşfet",
    "LociAR: AR Mekan & Harita Notu",
    "LociAR: 3D Harita ve AR Notlar"
]

tr_subtitles = [
    "Mekanlara 3D Mesaj & Harita",
    "3D Kamera, Harita ve Çeviri",
    "Sanal Anılar & Konum Haritası"
]

tr_promo = "Gerçek dünyayı dijital tuvaline dönüştür! İstediğin yere 3D AR notlar bırak, interaktif haritada keşfet, yaklaştığında anında bildirim al ve yabancı notları çevir."

for i, n in enumerate(tr_names):
    validate_length(f"TR Name {i+1}", n, 30)

for i, s in enumerate(tr_subtitles):
    validate_length(f"TR Subtitle {i+1}", s, 30)

validate_length("TR Promo", tr_promo, 170)

en_names = [
    "LociAR: AR Notes & World Map",
    "LociAR: Leave AR Notes on Map",
    "LociAR: Pin AR Notes in Places"
]

en_subtitles = [
    "Spatial 3D Pins & Geo Alerts",
    "Drop 3D Camera Pins & Alerts",
    "Drop 3D Camera Pins Anywhere"
]

en_promo = "Turn the physical world into your canvas! Anchor 3D AR notes to real places, discover memories on the interactive map, get arrival alerts, and translate text instantly."

for i, n in enumerate(en_names):
    validate_length(f"EN Name {i+1}", n, 30)

for i, s in enumerate(en_subtitles):
    validate_length(f"EN Subtitle {i+1}", s, 30)

validate_length("EN Promo", en_promo, 170)
