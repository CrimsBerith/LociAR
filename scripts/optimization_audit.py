#!/usr/bin/env python3
"""Reproducible optimization inventory. Scanning never attests a source review.

No credentials, remote services, installations, application files or git state are changed.
Only docs/optimization audit artifacts are written by this tool.
The implementation gate requires current, explicitly recorded full source reviews,
completed package assessments and a dated portfolio. Missing evidence is not a pass.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path("docs/optimization/audit-register.json")
CATALOG = Path("docs/optimization/catalog.json")
TEXT_SUFFIXES = {".swift", ".ts", ".tsx", ".mjs", ".py", ".sh", ".command",
                 ".yml", ".yaml", ".rules", ".xcconfig", ".entitlements", ".xcprivacy",
                 ".plist", ".css", ".html", ".storyboard", ".xcscheme"}
ASSET_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".ttf", ".otf", ".cer", ".pem"}
ROOT_CONFIGS = {"project.yml", "firebase.json", "firestore.indexes.json", ".firebaserc", "LICENSE", ".github/CODEOWNERS", "AGENTS.md", "admin/AGENTS.md"}
SCAN_PATTERNS = {
    "entrypoint": r"\b(?:onCall|onRequest|onSchedule|onDocumentCreated|onDocumentUpdated|onDocumentWritten|onDocumentDeleted|onObjectFinalized)\s*\(|\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(",
    "query": r"\.(?:where|whereField|orderBy|order|limit|limitToLast|offset|startAfter|startAt|start|count|select)\s*\(",
    "io": r"\.(?:get|getAll|getDocument|getDocuments|set|setData|create|update|updateData|delete|commit|runTransaction|data|download|upload|httpsCallable|call|callRaw)\s*\(",
    "task": r"\b(?:Task|withTaskGroup|withThrowingTaskGroup|Promise\.all|setInterval|setTimeout)\b",
    "sensor": r"\b(?:startUpdatingLocation|stopUpdatingLocation|startMonitoring|stopMonitoring|requestLocation|desiredAccuracy|distanceFilter|session\.run|session\.pause)\b",
    "cache": r"\b(?:NSCache|URLCache|cache|Cache|cached|TTL|fetchLimit|fetchOffset)\b",
    "network": r"\b(?:fetch|URLSession|httpsCallable|callRaw|onSnapshot|addSnapshotListener)\b",
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True)


def selected(path: str) -> bool:
    p = Path(path)
    if any(x in p.parts for x in ("node_modules", "build", "dist", ".next", ".git")):
        return False
    if path.startswith("docs/") or p.name.startswith(".env"):
        return False
    if p.name == "package-lock.json" or p.name == "Package.resolved":
        return True
    if path in ROOT_CONFIGS or p.name in {"package.json", "tsconfig.json", "Contents.json"}:
        return True
    if p.suffix in TEXT_SUFFIXES | ASSET_SUFFIXES | {".xcstrings", ".pbxproj", ".xcworkspacedata", ".geojson"}:
        return True
    return p.suffix == ".json" and path.startswith(("scripts/", "functions/scripts/", "admin/scripts/", "admin/tests/"))


def kind(path: str) -> str:
    p = Path(path)
    if p.name in {"package-lock.json", "Package.resolved"}:
        return "dependency_manifest"
    if p.suffix in ASSET_SUFFIXES:
        return "binary_or_vector_asset"
    if p.suffix in {".xcstrings", ".pbxproj", ".xcworkspacedata"} or p.name == "next-env.d.ts":
        return "generated"
    if "/test/" in path or "/tests/" in path or "/e2e/" in path or path.startswith(("LociARTests/", "LociARUITests/", "scripts/test/")):
        return "test"
    if p.name in {"next.config.ts", "playwright.config.ts"}:
        return "configuration_or_tool"
    if path.startswith("LociAR/") and p.suffix == ".swift":
        return "owned_source"
    if path.startswith("functions/src/") and p.suffix == ".ts":
        return "owned_source"
    if path.startswith("admin/") and p.suffix in {".ts", ".tsx"}:
        return "owned_source"
    return "configuration_or_tool"


def units_for(path: str, catalog: dict) -> list[str]:
    return [u["id"] for u in catalog["units"] if any(fnmatch.fnmatchcase(path, pattern) for pattern in u["patterns"])]


def reviewed_lines(record: dict) -> int:
    covered = set()
    for review in record.get("reviews", []):
        if review["sha256"] == record["sha256"]:
            covered.update(range(review["start"], review["end"] + 1))
    return len(covered)


def dependencies(root: Path) -> list[dict]:
    result = []
    for workspace in ("functions", "admin"):
        lock = json.loads((root / workspace / "package-lock.json").read_text())
        manifest = json.loads((root / workspace / "package.json").read_text())
        for location, data in sorted(lock.get("packages", {}).items()):
            if not location:
                continue
            name = data.get("name") or location.rsplit("node_modules/", 1)[-1]
            result.append({
                "id": f"npm:{workspace}:{location}", "ecosystem": "npm", "workspace": workspace,
                "name": name, "location": location, "version": data.get("version"),
                "direct": location == f"node_modules/{name}" and name in manifest.get("dependencies", {}),
                "dev_direct": location == f"node_modules/{name}" and name in manifest.get("devDependencies", {}),
                "lock_dev_flag": data.get("dev", False), "optional": data.get("optional", False),
                "license": data.get("license"), "integrity": data.get("integrity"),
                "assessment_status": "pending", "runtime_reachability": "unverified",
                "binary_size": None, "security_review": "pending", "privacy_review": "pending",
            })
    path = root / "LociAR.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
    if path.exists():
        for pin in json.loads(path.read_text()).get("pins", []):
            result.append({"id": f"spm:{pin['identity']}", "ecosystem": "spm", "name": pin["identity"],
                           "version": pin["state"].get("version"), "revision": pin["state"].get("revision"),
                           "assessment_status": "pending", "runtime_reachability": "unverified",
                           "binary_size": None, "security_review": "pending", "privacy_review": "pending"})
    return result


def inventory(root: Path, catalog: dict, previous: dict) -> dict:
    paths = sorted(set(git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0")) - {""})
    old = {f["path"]: f for f in previous.get("files", [])}
    files, markers = [], []
    for name in paths:
        if not selected(name) or not (root / name).is_file():
            continue
        path = root / name
        file_kind = kind(name)
        binary = file_kind == "binary_or_vector_asset"
        lines = [] if binary else path.read_text(errors="replace").splitlines()
        record = {"path": name, "sha256": digest(path), "bytes": path.stat().st_size,
                  "lines": len(lines), "kind": file_kind, "units": units_for(name, catalog),
                  "reviews": old.get(name, {}).get("reviews", [])}
        record["reviewed_lines"] = reviewed_lines(record)
        record["review_status"] = ("reviewed" if lines and record["reviewed_lines"] == len(lines) else "pending")
        record["stale_review_count"] = sum(r["sha256"] != record["sha256"] for r in record["reviews"])
        files.append(record)
        if file_kind in {"owned_source", "configuration_or_tool"} and path.suffix in TEXT_SUFFIXES:
            for number, line in enumerate(lines, 1):
                if line.lstrip().startswith(("//", "#", "*", "/*")):
                    continue
                for category, pattern in SCAN_PATTERNS.items():
                    if re.search(pattern, line):
                        markers.append({"path": name, "line": number, "category": category, "units": record["units"]})
    old_deps = {d["id"]: d for d in previous.get("dependencies", [])}
    deps = dependencies(root)
    for dep in deps:
        prior = old_deps.get(dep["id"], {})
        if all(prior.get(key) == dep.get(key) for key in ("version", "revision", "integrity")):
            for field in ("assessment_status", "runtime_reachability", "binary_size", "security_review", "privacy_review", "evidence_ids"):
                if field in prior:
                    dep[field] = prior[field]
    old_units = {u["id"]: u for u in previous.get("units", [])}
    units = []
    for spec in catalog["units"]:
        prior = old_units.get(spec["id"], {})
        assigned = [f for f in files if spec["id"] in f["units"]]
        scope_hash = hashlib.sha256(json.dumps([(f["path"], f["sha256"]) for f in assigned]).encode()).hexdigest()
        assessed = prior.get("assessment_status") == "assessed" and prior.get("assessed_scope_sha256") == scope_hash
        units.append({**spec, "assessment_status": "assessed" if assessed else "in_review" if any(f["reviewed_lines"] for f in assigned) else "pending",
                      "scope_sha256": scope_hash,
                      "assessed_scope_sha256": prior.get("assessed_scope_sha256"),
                      "decision": prior.get("decision", "measure"),
                      "application_status": prior.get("application_status", "not_started"),
                      "assessment": prior.get("assessment", {}),
                      "file_count": len(assigned), "fully_reviewed_files": sum(f["review_status"] == "reviewed" for f in assigned),
                      "evidence_ids": prior.get("evidence_ids", [])})
    evidence = []
    current_hashes = {f["path"]: f["sha256"] for f in files}
    for item in previous.get("evidence", []):
        target = root / item["path"]
        stale_sources = [path for path, sha in item.get("source_hashes", {}).items() if current_hashes.get(path) != sha]
        evidence.append({**item, "artifact_current": target.is_file() and digest(target) == item["sha256"],
                         "stale_source_paths": stale_sources})
    inventory_hash = hashlib.sha256(json.dumps({
        "files": [(f["path"], f["sha256"]) for f in files],
        "dependencies": [(d["id"], d.get("version"), d.get("revision"), d.get("integrity")) for d in deps],
        "catalog": digest(root / CATALOG),
    }, sort_keys=True).encode()).hexdigest()
    return {"schema_version": 1, "generated_at": now(), "root": str(root), "inventory_sha256": inventory_hash,
            "head": git(root, "rev-parse", "HEAD").strip(),
            "baseline": previous.get("baseline") or {"captured_at": now(), "git_status": git(root, "status", "--porcelain=v1"),
                                                       "files": [{"path": f["path"], "sha256": f["sha256"]} for f in files]},
            "catalog_sha256": digest(root / CATALOG), "parameters": catalog["parameters"],
            "sources": catalog["sources"], "files": files,
            "static_markers": {"method": "line_regex_inventory_not_exhaustive_or_runtime_evidence", "records": markers},
            "dependencies": deps, "units": units, "evidence": evidence,
            "findings": previous.get("findings", []), "portfolio": previous.get("portfolio"),
            "cost_model": previous.get("cost_model", {}), "legacy_mapping": previous.get("legacy_mapping", []),
            "coverage": {"files": len(files), "owned_source_files": sum(f["kind"] == "owned_source" for f in files),
                         "owned_source_lines": sum(f["lines"] for f in files if f["kind"] == "owned_source"),
                         "reviewed_owned_source_lines": sum(f["reviewed_lines"] for f in files if f["kind"] == "owned_source"),
                         "unassigned": [f["path"] for f in files if not f["units"]]}}


def gate(register: dict) -> list[str]:
    reasons = []
    if register["coverage"]["unassigned"]:
        reasons.append("unassigned_files")
    if any(f["review_status"] != "reviewed" for f in register["files"] if f["kind"] == "owned_source"):
        reasons.append("owned_source_review_incomplete")
    if any(u["assessment_status"] != "assessed" for u in register["units"]):
        reasons.append("package_assessment_incomplete")
    if any(d["assessment_status"] != "assessed" for d in register["dependencies"]):
        reasons.append("dependency_assessment_incomplete")
    if not register.get("portfolio"):
        reasons.append("portfolio_missing")
    elif register["portfolio"].get("inventory_sha256") != register.get("inventory_sha256"):
        reasons.append("portfolio_stale")
    return reasons


def save(root: Path, register: dict) -> None:
    register["implementation_gate"] = {"open": not gate(register), "reasons": gate(register)}
    target = root / OUTPUT
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(register, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(target)


def render_reports(root: Path, register: dict) -> None:
    """Render recorded observations; never infer an assessment or mark a unit complete."""
    sources = {s["id"]: s for s in register["sources"]}
    for unit in register["units"]:
        target = (root / "docs/optimization" / unit["report"]).resolve()
        if target.parent != (root / "docs/optimization/reports").resolve() or target.name != unit["id"] + ".md":
            raise ValueError("Report must be reports/<unit-id>.md inside docs/optimization")
        assigned = [f for f in register["files"] if unit["id"] in f["units"]]
        owned = [f for f in assigned if f["kind"] == "owned_source"]
        findings = [f for f in register["findings"] if unit["id"] in f["units"]]
        observation = unit.get("assessment", {})
        lines = [f"# {unit['id']} — {unit['title']}", "", "<!-- Rendered from audit-register.json; edit assessment/findings there, then render. -->", "",
                 f"Güncelleme: {register['generated_at']} · Kaynak commit: {register['head']}", "",
                 f"Değerlendirme: **{unit['assessment_status']}** · Karar: **{unit['decision']}** · Uygulama: **{unit['application_status']}**", "",
                 "## 1. Kimlik ve kapsam", "",
                 f"{len(assigned)} envanter dosyası; {sum(f['lines'] for f in owned)} kendi kaynak satırı; "
                 f"{sum(f['reviewed_lines'] for f in owned)} açıkça incelenmiş kaynak satırı. "
                 "Envanterleme ve test çalışması satır incelemesi sayılmaz.", "",
                 "## 2. Olması gereken", "", unit["goal"], "", "Resmî kaynaklar:", ""]
        lines += [f"- [{key}]({sources[key]['url']}) — {sources[key]['status']}; araştırma {sources[key]['research_date']}." for key in unit["source_ids"]]
        lines += ["", "## 3. Bizde olan", "", observation.get("current", "Dosya ve işaret envanteri çıkarıldı. Paket düzeyindeki semantik değerlendirme tamamlanmadı; uygunluk sonucu verilmedi."), ""]
        for f in assigned:
            notes = [r["note"] for r in f["reviews"] if r["sha256"] == f["sha256"] and unit["id"] in r.get("units", [])]
            if notes:
                lines.append(f"- [{f['path']}](<{root / f['path']}>) — " + " ".join(dict.fromkeys(notes)))
        lines += ["", "## 4. Başlangıç ölçümü ve kanıt", "", "Süreler yalnız ilgili cihaz/fixture için geçerlidir. Emulator mantıksal IO sayımı fatura değildir.", ""]
        for e in register["evidence"]:
            if unit["id"] in e["units"]:
                lines.append(f"- {e['id']} · {e['kind']} · {e['result']} · {e.get('purpose', 'baseline')} · [{e['path']}](<{root / e['path']}>) — {e['note']}")
        lines += ["", "## 5. Bulgular", ""]
        if not findings:
            lines.append("Bu pakette henüz kesinleştirilmiş bulgu kaydı yok. Bu ifade sorun bulunmadığı anlamına gelmez.")
        for finding in findings:
            lines += [f"### {finding['id']} — {finding['title']} ({finding['priority']})", "", finding["current"], "",
                      "**Olması gereken:** " + finding["ideal"], "",
                      "**Ölçüm/kanıt:** " + json.dumps(finding.get("baseline", {}), ensure_ascii=False), "",
                      "**Öneri:** " + finding["proposal"], "",
                      "**Kabul:** " + finding["validation"], "",
                      "**Sınır:** " + finding["limitation"], ""]
            if finding.get("source_ids"):
                lines += ["Kaynak: " + ", ".join(f"[{key}]({sources[key]['url']})" for key in finding["source_ids"]), ""]
        lines += ["", "## 6. Önerilen çalışma", "", observation.get("proposal", "Bütün değerlendirme tamamlanınca bulgular toplam maliyet, güvenlik ve bakım etkisine göre kesinleştirilecek. Bu paket henüz uygulama için kapatılmadı."), "",
                  "## 7. Maliyet ve risk", "", observation.get("cost", "100/1.000/10.000 DAU modeli ana kayıtta. Bu pakete ait gerçek para tasarrufu henüz ölçülmedi; null değer sıfır maliyet değildir."), "",
                  observation.get("risk", "Server-authoritative yazma, güncel hesap/rıza/engel kontrolü, anonimlik, hard delete ve sağlayıcı koşulları korunacak. İndeks/TTL/ek bakım gideri ayrıca sayılacak."), "",
                  "## 8. Uygulama ve doğrulama", "", observation.get("after", "Bu denetim paketinde henüz ürün değişikliği kaydı yok. Önceki optimizasyonlar baseline'ın parçasıdır; bu tur uygulanmış gibi sayılmadı. Önce/sonra alanı boş."), "",
                  "## 9. Kalan işler ve kapsam", "", unit["checks"], "",
                  "Aşağıdaki satır kapsamı semantik inceleme kaydıdır; runtime/test kapsamı ayrı tutulur.", "",
                  "| Dosya | Tür | Satır | İncelenen | SHA-256 başlangıcı |", "|---|---|---:|---:|---|"]
        lines += [f"| {f['path']} | {f['kind']} | {f['lines']} | {f['reviewed_lines']} | {f['sha256'][:12]} |" for f in assigned]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(lines) + "\n")
    master = root / "docs/optimization/MASTER_PLAN.md"
    if master.exists():
        c = register["coverage"]
        complete = sum(u["assessment_status"] == "assessed" for u in register["units"])
        dashboard = ["<!-- audit-status:start -->", f"Snapshot: {register['generated_at']}", "",
                     f"- Envanter: {c['files']} dosya; {len(register['dependencies'])} bağımlılık kaydı; sahipsiz dosya: {len(c['unassigned'])}.",
                     f"- Kendi kaynak kodu: {c['owned_source_files']} dosya, {c['owned_source_lines']} satır; açıkça incelenen {c['reviewed_owned_source_lines']} satır.",
                     f"- Tam değerlendirilmiş paket: **{complete}/{len(register['units'])}**. Rapor dosyası oluşturmak değerlendirmeyi tamamlamaz.",
                     f"- Bulgu: {len(register['findings'])}; kanıt: {len(register['evidence'])}; uygulama kapısı: **{'açık' if not gate(register) else 'kapalı'}**.",
                     "", "| Paket | Başlık | Değerlendirme | Kaynak dosyası incelemesi |", "|---|---|---|---|"]
        dashboard += [f"| [{u['id']}](<{root / 'docs/optimization' / u['report']}>) | {u['title']} | {u['assessment_status']} | {u['fully_reviewed_files']}/{u['file_count']} |" for u in register["units"]]
        dashboard += ["<!-- audit-status:end -->"]
        master.write_text(re.sub(r"<!-- audit-status:start -->.*?<!-- audit-status:end -->", "\n".join(dashboard), master.read_text(), flags=re.DOTALL))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("refresh", "check", "review", "evidence", "render"))
    parser.add_argument("--path")
    parser.add_argument("--range", dest="line_range")
    parser.add_argument("--note")
    parser.add_argument("--unit", action="append", default=[])
    parser.add_argument("--require-assessed", action="store_true")
    parser.add_argument("--result", choices=("pass", "fail", "blocked", "historical"))
    parser.add_argument("--kind", choices=("source", "unit", "emulator", "simulator", "device", "live_metadata", "live_measurement", "ci", "store"))
    parser.add_argument("--purpose", choices=("baseline", "regression", "diagnostic", "inventory"), default="baseline")
    args = parser.parse_args()
    catalog = json.loads((ROOT / CATALOG).read_text())
    previous = json.loads((ROOT / OUTPUT).read_text()) if (ROOT / OUTPUT).exists() else {}
    current = inventory(ROOT, catalog, previous)
    if args.action == "check":
        old_files = {f["path"]: f["sha256"] for f in previous.get("files", [])}
        new_files = {f["path"]: f["sha256"] for f in current["files"]}
        stale = sorted(p for p in old_files.keys() | new_files.keys() if old_files.get(p) != new_files.get(p))
        errors = (["inventory_stale"] if stale or previous.get("catalog_sha256") != current["catalog_sha256"] else [])
        if current["coverage"]["unassigned"]:
            errors.append("unassigned_files")
        if args.require_assessed:
            errors.extend(gate(current))
        print(json.dumps({"check_kind": "inventory_integrity", "result": "fail" if errors else "pass", "errors": sorted(set(errors)),
                          "stale_files": stale, "coverage": current["coverage"], "implementation_gate": gate(current)}, ensure_ascii=False, indent=2))
        return 1 if errors else 0
    if args.action == "review":
        if not args.path or not args.line_range or not args.note or not args.unit:
            parser.error("review requires --path, --range START:END, --note and --unit")
        file = next((f for f in current["files"] if f["path"] == args.path), None)
        if not file:
            parser.error("path is not an inventory entry")
        try:
            start, end = map(int, args.line_range.split(":"))
        except ValueError:
            parser.error("range must be START:END")
        if not 1 <= start <= end <= file["lines"] or not set(args.unit) <= set(file["units"]):
            parser.error("invalid range or units not assigned to file")
        file["reviews"].append({"start": start, "end": end, "sha256": file["sha256"],
                                "at": now(), "units": args.unit, "note": args.note})
        file["reviewed_lines"] = reviewed_lines(file)
        file["review_status"] = "reviewed" if file["reviewed_lines"] == file["lines"] else "partial"
        # Recalculate all derived counts after recording the attestation.
        current = inventory(ROOT, catalog, current)
    if args.action == "evidence":
        if not args.path or not args.note or not args.kind or not args.result or not args.unit:
            parser.error("evidence requires --path, --note, --kind, --result and --unit")
        path = (ROOT / args.path).resolve()
        try:
            path.relative_to(ROOT)
        except ValueError:
            parser.error("evidence must be inside the repository")
        if not path.is_file() or not set(args.unit) <= {u["id"] for u in current["units"]}:
            parser.error("evidence file missing or invalid unit")
        entry = {"id": f"E{len(current['evidence']) + 1:04}", "path": args.path, "sha256": digest(path),
                 "kind": args.kind, "result": args.result, "at": now(), "head": current["head"],
                 "units": args.unit, "note": args.note,
                 "purpose": args.purpose,
                 "source_hashes": {f["path"]: f["sha256"] for f in current["files"] if set(args.unit) & set(f["units"])}}
        current["evidence"].append(entry)
        for unit in current["units"]:
            if unit["id"] in args.unit:
                unit["evidence_ids"].append(entry["id"])
    save(ROOT, current)
    if args.action == "render":
        render_reports(ROOT, current)
    print(json.dumps({"written": str(OUTPUT), "coverage": current["coverage"],
                      "units": len(current["units"]), "dependencies": len(current["dependencies"]),
                      "implementation_gate": current["implementation_gate"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
