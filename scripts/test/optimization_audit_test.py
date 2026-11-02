"""Integrity tests for the audit gate, not assertions that LociAR is optimized."""
import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("audit", Path(__file__).resolve().parents[1] / "optimization_audit.py")
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


class AuditIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "LociAR").mkdir()
        (self.root / "LociAR/Source.swift").write_text("import Foundation\nfunc load() {}\n")
        (self.root / audit.CATALOG).parent.mkdir(parents=True)
        self.catalog = {"units": [{"id": "U01", "title": "Fixture", "patterns": ["LociAR/*"],
                                   "source_ids": [], "goal": "Review", "checks": "Check", "report": "reports/U01.md"}],
                        "parameters": {}, "sources": []}
        (self.root / audit.CATALOG).write_text(json.dumps(self.catalog))
        self.git_mock = patch.object(audit, "git", side_effect=lambda root, *args: "LociAR/Source.swift\0" if args[0] == "ls-files" else "synthetic-head" if args[0] == "rev-parse" else "")
        self.git_mock.start()
        self.addCleanup(self.git_mock.stop)
        self.dep_mock = patch.object(audit, "dependencies", return_value=[])
        self.dep_mock.start()
        self.addCleanup(self.dep_mock.stop)

    def initial(self):
        return audit.inventory(self.root, self.catalog, {})

    def test_scanning_never_attests_review_or_opens_gate(self):
        r = self.initial()
        self.assertEqual(r["coverage"]["reviewed_owned_source_lines"], 0)
        self.assertEqual(r["files"][0]["reviews"], [])
        self.assertIn("owned_source_review_incomplete", audit.gate(r))
        self.assertIn("package_assessment_incomplete", audit.gate(r))

    def test_source_change_invalidates_attestation_unit_and_portfolio(self):
        r = self.initial()
        file = r["files"][0]
        file["reviews"] = [{"sha256": file["sha256"], "start": 1, "end": 2}]
        r["units"][0].update(assessment_status="assessed", assessed_scope_sha256=r["units"][0]["scope_sha256"])
        r["portfolio"] = {"inventory_sha256": r["inventory_sha256"]}
        valid = audit.inventory(self.root, self.catalog, r)
        self.assertEqual(audit.gate(valid), [])
        (self.root / "LociAR/Source.swift").write_text("import Foundation\nfunc load() { fatalError() }\n")
        changed = audit.inventory(self.root, self.catalog, valid)
        self.assertEqual(changed["files"][0]["reviewed_lines"], 0)
        self.assertEqual(changed["files"][0]["stale_review_count"], 1)
        self.assertNotEqual(changed["units"][0]["assessment_status"], "assessed")
        self.assertIn("portfolio_stale", audit.gate(changed))

    def test_overlapping_reviews_do_not_double_count(self):
        record = {"sha256": "current", "reviews": [
            {"sha256": "current", "start": 1, "end": 5},
            {"sha256": "current", "start": 3, "end": 7},
            {"sha256": "stale", "start": 1, "end": 100},
        ]}
        self.assertEqual(audit.reviewed_lines(record), 7)

    def test_dependency_same_version_new_integrity_loses_assessment(self):
        self.dep_mock.stop()
        for workspace in ("functions", "admin"):
            (self.root / workspace).mkdir()
            (self.root / workspace / "package.json").write_text(json.dumps({"dependencies": {"example": "1.0.0"}}))
            (self.root / workspace / "package-lock.json").write_text(json.dumps({"packages": {"node_modules/example": {"version": "1.0.0", "integrity": "new"}}}))
        previous = self.initial()
        for dep in previous["dependencies"]:
            dep.update(assessment_status="assessed", integrity="old")
        refreshed = audit.inventory(self.root, self.catalog, previous)
        self.assertTrue(all(d["assessment_status"] == "pending" for d in refreshed["dependencies"]))
        self.assertIn("dependency_assessment_incomplete", audit.gate(refreshed))

    def test_evidence_is_invalidated_when_source_or_artifact_changes(self):
        r = self.initial()
        artifact = self.root / "result.log"
        artifact.write_text("pass")
        r["evidence"] = [{"id": "E1", "path": "result.log", "sha256": audit.digest(artifact),
                          "source_hashes": {"LociAR/Source.swift": r["files"][0]["sha256"]}}]
        self.assertTrue(audit.inventory(self.root, self.catalog, r)["evidence"][0]["artifact_current"])
        artifact.write_text("modified")
        (self.root / "LociAR/Source.swift").write_text("new source")
        evidence = audit.inventory(self.root, self.catalog, r)["evidence"][0]
        self.assertFalse(evidence["artifact_current"])
        self.assertEqual(evidence["stale_source_paths"], ["LociAR/Source.swift"])

    def test_unassigned_source_blocks_gate(self):
        self.catalog["units"][0]["patterns"] = ["other/*"]
        r = self.initial()
        self.assertEqual(r["coverage"]["unassigned"], ["LociAR/Source.swift"])
        self.assertIn("unassigned_files", audit.gate(r))

    def test_secret_files_excluded_and_test_files_not_runtime_source(self):
        self.assertFalse(audit.selected("admin/.env.production"))
        self.assertFalse(audit.selected("functions/node_modules/x/index.ts"))
        self.assertEqual(audit.kind("admin/e2e/example.spec.ts"), "test")
        self.assertEqual(audit.kind("admin/next-env.d.ts"), "generated")
        self.assertEqual(audit.kind("admin/proxy.ts"), "owned_source")

    def test_check_is_read_only_and_full_gate_fails_on_inventory_only(self):
        r = self.initial()
        audit.save(self.root, r)
        before = (self.root / audit.OUTPUT).read_bytes()
        with patch.object(audit, "ROOT", self.root), patch("sys.argv", ["audit", "check", "--require-assessed"]), redirect_stdout(io.StringIO()) as output:
            code = audit.main()
        self.assertEqual(code, 1)
        self.assertIn("owned_source_review_incomplete", json.loads(output.getvalue())["errors"])
        self.assertEqual(before, (self.root / audit.OUTPUT).read_bytes())

    def test_rendering_reports_does_not_promote_assessment(self):
        r = self.initial()
        audit.render_reports(self.root, r)
        report = (self.root / "docs/optimization/reports/U01.md").read_text()
        self.assertIn("**pending**", report)
        self.assertIn("## 9. Kalan işler", report)
        self.assertEqual(r["units"][0]["assessment_status"], "pending")
        self.assertIn("package_assessment_incomplete", audit.gate(r))


if __name__ == "__main__":
    unittest.main()
