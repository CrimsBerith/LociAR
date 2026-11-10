#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

DESKTOP_DIR = "/Users/khankartal/Desktop/LociAR_Tum_Ekranlar"
# Private per-run work directory (mode 0700) instead of fixed, shared /tmp paths.
WORK_DIR = tempfile.mkdtemp(prefix="lociar-screen-tour-")
XCRESULT_PATH = os.path.join(WORK_DIR, "AllScreenTours.xcresult")
ATTACHMENTS_DIR = os.path.join(WORK_DIR, "AllScreenTourAttachments")
SIM_ID = "FD4D823B-C6E7-4547-845D-429ACB89A564"

TOURS = [
    "testScreenTour01Onboarding",
    "testScreenTour02Authentication",
    "testScreenTour03PrimaryTabs",
    "testScreenTour04ProfileLists",
    "testScreenTour05SettingsAndProfileEdit",
    "testScreenTour06PostAndSafety",
    "testScreenTour07EditorAndGIF",
    "testScreenTour08LocationNoteAndSurface",
    "testScreenTour09ARViewer",
    "testScreenTour10aCameraPermissionRecovery",
    "testScreenTour10bLocationPermissionRecovery",
    "testScreenTour11GuestAccount"
]

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def main():
    os.makedirs(DESKTOP_DIR, exist_ok=True)
    if os.path.exists(XCRESULT_PATH):
        shutil.rmtree(XCRESULT_PATH)
    if os.path.exists(ATTACHMENTS_DIR):
        shutil.rmtree(ATTACHMENTS_DIR)

    log(f"Ekran turları başlatılıyor ({len(TOURS)} test senaryosu)...")
    
    cmd = [
        "xcodebuild", "test",
        "-project", "LociAR.xcodeproj",
        "-scheme", "LociAR",
        "-destination", f"id={SIM_ID}",
        "-resultBundlePath", XCRESULT_PATH
    ]
    for t in TOURS:
        cmd.append(f"-only-testing:LociARUITests/AuthGateUITests/{t}")

    loci_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    proc = subprocess.Popen(cmd, cwd=loci_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    for line in iter(proc.stdout.readline, ''):
        line_clean = line.strip()
        if "Test Case" in line_clean or "passed" in line_clean or "failed" in line_clean or "Testing started" in line_clean:
            log(line_clean)

    proc.stdout.close()
    proc.wait()
    log(f"Testler tamamlandı. Çıkış kodu: {proc.returncode}")

    if not os.path.exists(XCRESULT_PATH):
        log(f"HATA: {XCRESULT_PATH} oluşturulamadı!")
        sys.exit(1)

    log("Ekran görüntüleri xcresult paketinden çıkartılıyor...")
    export_cmd = [
        "xcrun", "xcresulttool", "export", "attachments",
        "--path", XCRESULT_PATH,
        "--output-path", ATTACHMENTS_DIR
    ]
    res = subprocess.run(export_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        log(f"Hata: {res.stderr}")
        sys.exit(1)

    manifest_path = os.path.join(ATTACHMENTS_DIR, "manifest.json")
    if not os.path.exists(manifest_path):
        log("HATA: manifest.json yok!")
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    log(f"Ekran görüntüleri kopyalanıyor -> {DESKTOP_DIR}")
    captured_files = []

    for test_entry in manifest:
        attachments = test_entry.get("attachments", [])
        for att in attachments:
            exported_name = att.get("exportedFileName")
            human_name = att.get("suggestedHumanReadableName", exported_name)
            
            clean_name = human_name
            if "_" in human_name and human_name.endswith(".png"):
                parts = human_name.split("_")
                # Strip trailing UUID if present
                if len(parts) >= 3 and len(parts[-1]) >= 30:
                    clean_name = "_".join(parts[:-2]) + ".png"

            src = os.path.join(ATTACHMENTS_DIR, exported_name)
            dst = os.path.join(DESKTOP_DIR, clean_name)

            if os.path.exists(src):
                shutil.copy2(src, dst)
                captured_files.append(clean_name)
                log(f"  ✓ {clean_name}")

    captured_files = sorted(list(set(captured_files)))
    log(f"Toplam {len(captured_files)} benzersiz ekran görüntüsü kaydedildi.")

    # HTML Galeri Üretimi
    html_path = os.path.join(DESKTOP_DIR, "INDEX.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write("""<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>LociAR - Ekran Görüntüleri ve Arayüz Kataloğu</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0A0F1D; color: #F0F4F8; padding: 32px; margin: 0; }
        h1 { font-size: 26px; color: #00F0FF; margin-bottom: 6px; }
        p.sub { color: #8A99AD; margin-bottom: 24px; font-size: 14px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
        .card { background: #131B2E; border: 1px solid #1E2942; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
        .card:hover { border-color: #00F0FF; }
        img { width: 100%; height: auto; display: block; }
        .info { padding: 12px; font-size: 13px; font-weight: 500; word-break: break-all; }
        .tag { font-size: 10px; color: #00F0FF; text-transform: uppercase; margin-bottom: 4px; }
    </style>
</head>
<body>
    <h1>LociAR — Güncel Ekran ve Durum Kataloğu</h1>
    <p class="sub">Tüm onboarding, auth, harita, AR, profil, ayarlar ve moderasyon akışlarından otomatik yakalanan ekranlar.</p>
    <div class="grid">
""")
        for item in captured_files:
            f.write(f"""        <div class="card">
            <a href="{item}" target="_blank"><img src="{item}" alt="{item}" loading="lazy"></a>
            <div class="info">
                <div class="tag">Retina Snapshot</div>
                <div>{item}</div>
            </div>
        </div>
""")
        f.write("""    </div>
</body>
</html>
""")

    # Markdown Dökümü
    md_path = os.path.join(DESKTOP_DIR, "EKRANLAR.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("# LociAR — Güncel Ekran Görüntüleri Listesi\n\n")
        f.write(f"- **Tarih**: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"- **Toplam Ekran Sayısı**: {len(captured_files)}\n\n")
        f.write("| No | Dosya Adı | Açıklama |\n|---|---|---|\n")
        for i, f_name in enumerate(captured_files, 1):
            desc = f_name.replace(".png", "").replace("-", " ").replace("_", " ")
            f.write(f"| {i:02d} | `{f_name}` | {desc} |\n")

    log(f"Galeri hazırlandı: {html_path}")

if __name__ == "__main__":
    main()

