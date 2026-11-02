import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("monitoring_setup", Path(__file__).parents[1] / "setup-diagnostics-monitoring.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class FakeAPI:
    def __init__(self):
        self.data = {"notificationChannels": [], "alertPolicies": []}
        self.writes = []

    def list_all(self, kind):
        return copy.deepcopy(self.data[kind])

    def request(self, method, path, payload=None):
        base = path.split("?")[0]
        kind = base.split("/")[2]
        if method == "GET":
            return copy.deepcopy(next(r for r in self.data[kind] if r["name"] == base))
        self.writes.append((method, path, copy.deepcopy(payload)))
        if method == "POST":
            item = copy.deepcopy(payload)
            item["name"] = base + "/" + str(len(self.data[kind]) + 1)
            if kind == "alertPolicies":
                item["conditions"][0]["name"] = item["name"] + "/conditions/1"
            self.data[kind].append(item)
        else:
            item = next(r for r in self.data[kind] if r["name"] == base)
            item.update(copy.deepcopy(payload))
        return copy.deepcopy(item)


class MonitoringTests(unittest.TestCase):
    def test_creation_read_back_and_second_run_without_mutations(self):
        api = FakeAPI()
        first = setup.reconcile(api, "synthetic@example.invalid")
        self.assertEqual(first["verifiedPolicies"], 3)
        self.assertEqual(len(api.writes), 4)
        api.writes.clear()
        second = setup.reconcile(api, "synthetic@example.invalid")
        self.assertEqual(second["operations"], [])
        self.assertEqual(api.writes, [])

    def test_recipient_change_updates_only_managed_policies(self):
        api = FakeAPI()
        unrelated = {"name": "projects/lociar-2f38c/alertPolicies/unrelated", "displayName": "Keep me", "enabled": True}
        api.data["alertPolicies"].append(copy.deepcopy(unrelated))
        setup.reconcile(api, "first@example.invalid")
        api.writes.clear()
        setup.reconcile(api, "second@example.invalid")
        self.assertEqual(api.data["alertPolicies"][0], unrelated)
        self.assertEqual([w[0] for w in api.writes], ["POST", "PATCH", "PATCH", "PATCH"])
        self.assertTrue(all("conditions/1" in w[2]["conditions"][0]["name"] for w in api.writes if w[0] == "PATCH"))

    def test_duplicates_fail_before_any_writes(self):
        api = FakeAPI()
        setup.reconcile(api, "synthetic@example.invalid")
        api.data["alertPolicies"].append(copy.deepcopy(api.data["alertPolicies"][0]))
        api.writes.clear()
        with self.assertRaisesRegex(RuntimeError, "Duplicate"):
            setup.reconcile(api, "new@example.invalid")
        self.assertEqual(api.writes, [])

    def test_policies_use_existing_logs_without_metrics_or_payload_labels(self):
        policies = setup.policy_specs("projects/lociar-2f38c/notificationChannels/1")
        for policy in policies:
            self.assertEqual(len(policy["conditions"]), 1)
            condition = policy["conditions"][0]
            self.assertNotIn("conditionThreshold", condition)
            self.assertNotIn("labelExtractors", condition["conditionMatchedLog"])
            self.assertEqual(policy["alertStrategy"]["notificationRateLimit"]["period"], "3600s")
        self.assertIn("NOT", policies[1]["conditions"][0]["conditionMatchedLog"]["filter"])
        server_filter = policies[1]["conditions"][0]["conditionMatchedLog"]["filter"]
        self.assertIn('httpRequest.status=429 AND textPayload:"no available instance"', server_filter)
        fatal_filter = policies[2]["conditions"][0]["conditionMatchedLog"]["filter"]
        self.assertIn('jsonPayload.issue.errorType="FATAL"', fatal_filter)
        self.assertIn('jsonPayload.bundleOrPackage="com.khankartal.lociar"', fatal_filter)
        self.assertIn('firebasecrashlytics.googleapis.com%2Fevents', fatal_filter)

    def test_inventory_handles_pagination(self):
        api = object.__new__(setup.MonitoringAPI)
        paths = []
        def request(method, path):
            paths.append(path)
            return {"alertPolicies": [len(paths)], **({"nextPageToken": "next/page"} if len(paths) == 1 else {})}
        api.request = request
        self.assertEqual(api.list_all("alertPolicies"), [1, 2])
        self.assertIn("pageToken=next%2Fpage", paths[1])


if __name__ == "__main__":
    unittest.main()
