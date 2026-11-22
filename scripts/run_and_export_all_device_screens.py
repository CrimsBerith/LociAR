#!/usr/bin/env python3
import json
import re
import os
import shutil
import subprocess
import sys
import tempfile
import time
import html

# Output and target come from the environment; the defaults belong to no single developer.
DESKTOP_DIR = os.path.expanduser(os.environ.get("LOCIAR_SCREENS_DIR", "~/Desktop/LociAR_Tum_Ekranlar"))
# Private per-run work directory (mode 0700) instead of fixed, shared /tmp paths.
WORK_DIR = tempfile.mkdtemp(prefix="lociar-screen-tour-")
XCRESULT_PATH = os.path.join(WORK_DIR, "MasterDeviceTour.xcresult")
ATTACHMENTS_DIR = os.path.join(WORK_DIR, "MasterTourAttachments")
DEVICE_ID = os.environ.get("LOCIAR_TEST_DEVICE", "")

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def stream_output(proc):
    for line in iter(proc.stdout.readline, ''):
        line_clean = line.strip()
        if "Test Case" in line_clean or "capture" in line_clean or "passed" in line_clean or "failed" in line_clean or "Testing started" in line_clean:
            log(line_clean)
            
    proc.stdout.close()
    proc.wait()

def main():
    if not re.fullmatch(r"[0-9A-Fa-f-]{20,40}", DEVICE_ID):
        log("HATA: LOCIAR_TEST_DEVICE=<UDID> gerekli.")
        sys.exit(2)
    os.makedirs(DESKTOP_DIR, exist_ok=True)
    
    if os.path.exists(XCRESULT_PATH):
        shutil.rmtree(XCRESULT_PATH)
    if os.path.exists(ATTACHMENTS_DIR):
        shutil.rmtree(ATTACHMENTS_DIR)
        
    log(f"USB üzerinden Kağan iPhone'unda ({DEVICE_ID}) tüm ekranlar ve aksiyonlar için XCUITest başlatılıyor...")
    cmd = [
        "xcodebuild", "test",
        "-scheme", "LociAR",
        "-destination", f"platform=iOS,id={DEVICE_ID}",
        "-only-testing:LociARUITests/AuthGateUITests/testMasterCaptureAllScreensAndActionsOnDevice",
        "-resultBundlePath", XCRESULT_PATH,
        "-allowProvisioningUpdates"
    ]
    
    loci_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    proc = subprocess.Popen(cmd, cwd=loci_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        stream_output(proc)
    except KeyboardInterrupt:
        # Never leave xcodebuild running after Ctrl-C.
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        raise
    tests_failed = proc.returncode != 0
    
    log(f"Test yürütmesi tamamlandı. Çıkış kodu: {proc.returncode}")
    
    if not os.path.exists(XCRESULT_PATH):
        log(f"HATA: {XCRESULT_PATH} oluşturulamadı!")
        sys.exit(1)
        
    log("Ekran görüntüleri xcresult içerisinden çıkartılıyor...")
    export_cmd = [
        "xcrun", "xcresulttool", "export", "attachments",
        "--path", XCRESULT_PATH,
        "--output-path", ATTACHMENTS_DIR
    ]
    res = subprocess.run(export_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        log(f"xcresulttool export hatası: {res.stderr}")
        sys.exit(1)
        
    manifest_path = os.path.join(ATTACHMENTS_DIR, "manifest.json")
    if not os.path.exists(manifest_path):
        log("HATA: manifest.json bulunamadı!")
        sys.exit(1)
        
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
        
    log(f"Dışa aktarılan ekranlar masaüstündeki klasöre kopyalanıyor: {DESKTOP_DIR}")
    
    captured_files = []
    
    for test_entry in manifest:
        attachments = test_entry.get("attachments", [])
        for att in attachments:
            exported_name = att.get("exportedFileName")
            if not exported_name:
                continue
            human_name = att.get("suggestedHumanReadableName", exported_name)
            
            # Clean up the human readable name (strip UUID suffixes if present)
            base_title = human_name
            if "_" in human_name:
                parts = human_name.split("_")
                # e.g. "01_Onboarding_Adim1_Mekan_Notlari_0_UUID.png"
                if len(parts) >= 3 and parts[-1].endswith(".png") and len(parts[-1]) >= 30:
                    base_title = "_".join(parts[:-2]) + ".png"
            
            src = os.path.join(ATTACHMENTS_DIR, os.path.basename(exported_name))
            base_title = os.path.basename(base_title) or os.path.basename(exported_name)
            dst = os.path.join(DESKTOP_DIR, base_title)
            
            if os.path.exists(src):
                shutil.copy2(src, dst)
                captured_files.append(base_title)
                log(f" Kaydedildi: {base_title}")
                
    captured_files = sorted(set(captured_files))
    
    # Generate HTML Gallery
    html_path = os.path.join(DESKTOP_DIR, "INDEX.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write("""<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>LociAR - Kağan iPhone Ekran Görüntüleri ve Otomasyon Arşivi</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0A0F1D; color: #F0F4F8; padding: 32px; margin: 0; }
        h1 { font-size: 28px; font-weight: 700; color: #00F0FF; margin-bottom: 8px; }
        p.subtitle { color: #8A99AD; margin-bottom: 32px; font-size: 15px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
        .card { background: #131B2E; border: 1px solid #1E2942; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.3); transition: transform 0.2s, border-color 0.2s; }
        .card:hover { transform: translateY(-4px); border-color: #00F0FF; }
        .img-container { width: 100%; aspect-ratio: 9/19.5; background: #06090E; display: flex; align-items: center; justify-content: center; }
        img { width: 100%; height: 100%; object-fit: cover; }
        .info { padding: 16px; }
        .badge { display: inline-block; padding: 4px 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; border-radius: 6px; background: rgba(0, 240, 255, 0.15); color: #00F0FF; margin-bottom: 8px; }
        .title { font-size: 14px; font-weight: 600; word-break: break-all; color: #FFFFFF; }
    </style>
</head>
<body>
    <h1>LociAR - iOS Ekran ve Aksiyon Arşivi</h1>
    <p class="subtitle">Kağan iPhone'u (UDID: """ + DEVICE_ID + """) üzerinde USB otomasyonu ile kaydedilen tüm ekranlar, buton tıklamaları, formlar ve diyaloglar.</p>
    <div class="grid">
""")
        for item in captured_files:
            f.write(f"""
        <div class="card">
            <div class="img-container">
                <a href="{html.escape(item)}" target="_blank">
                    <img src="{html.escape(item)}" alt="{html.escape(item)}" loading="lazy">
                </a>
            </div>
            <div class="info">
                <span class="badge">Orijinal Retina Ekran</span>
                <div class="title">{html.escape(item)}</div>
            </div>
        </div>
""")
        f.write("""
    </div>
</body>
</html>
""")

    # Generate Markdown Summary
    md_path = os.path.join(DESKTOP_DIR, "EKRANLAR_LISTESI.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("# LociAR - Tüm Ekran ve Etkileşim Kayıtları\n\n")
        f.write(f"- **Cihaz**: Kağan iPhone’u (`{DEVICE_ID}`)\n")
        f.write(f"- **Kayıt Tarihi**: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"- **Toplam Kaydedilen Ekran / Aksiyon Sayısı**: {len(captured_files)}\n\n")
        f.write("| No | Dosya Adı | Açıklama |\n")
        f.write("|---|---|---|\n")
        for idx, item in enumerate(captured_files, 1):
            desc = item.replace(".png", "").replace("_", " ")
            f.write(f"| {idx:02d} | `{item}` | {desc} |\n")

    log(f"Tamamlandı! Toplam {len(captured_files)} ekran görüntüsü başarıyla '{DESKTOP_DIR}' klasörüne kaydedildi.")
    if tests_failed:
        log("Bazı testler başarısız oldu; çıkış kodu 1.")
    return 1 if tests_failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        shutil.rmtree(WORK_DIR, ignore_errors=True)

