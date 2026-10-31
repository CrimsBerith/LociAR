#!/usr/bin/env python3
"""Existing logs -> email alerts. Default is a plan; --apply changes labelled resources only.
No custom metrics, schedules, exports, IAM changes, API enablement or billing changes.
"""
import argparse
import copy
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "lociar-2f38c"
OWNER = {"lociar_diagnostics": "v1"}
CRITICAL_EVENTS = (
    "apple_revoke_failed", "apple_revoke_unavailable", "account_deletion_deferred",
    "account_deletion_retry_failed", "media_cleanup_deferred", "avatar_deletion_deferred",
    "orphan_upload_reclamation_failed", "cloud_anchor_delete_failed", "cloud_anchor_queue_failed",
    "cloud_anchor_cleanup_failed", "kill_switch_refused",
)


def policy_specs(channel):
    events = " OR ".join(f'jsonPayload.message="{e}" OR textPayload:"{e}"' for e in CRITICAL_EVENTS)
    specs = []
    for signal, title, query in (
        ("account_cleanup", "Account, cleanup and service pause", f'resource.type="cloud_run_revision" AND ({events})'),
        ("server_errors", "Server errors", f'resource.type="cloud_run_revision" '
         f'AND (severity>=ERROR OR (httpRequest.status=429 AND textPayload:"no available instance")) AND NOT ({events})'),
        ("ios_fatal", "iOS fatal crashes", f'logName="projects/{PROJECT}/logs/firebasecrashlytics.googleapis.com%2Fevents" '
         'AND jsonPayload.bundleOrPackage="com.khankartal.lociar" AND jsonPayload.platform="IOS" '
         'AND jsonPayload.issue.errorType="FATAL"'),
    ):
        specs.append({
            "displayName": f"LociAR diagnostics - {title}",
            "userLabels": {**OWNER, "signal": signal}, "combiner": "OR", "enabled": True,
            "documentation": {"mimeType": "text/markdown", "content":
                "A matching log opened this incident. Check the affected app/service, version, deployment and retries. "
                "Do not weaken account deletion or privacy safeguards.\n\n"
                "Notifications: at most once per hour per policy. This is not a count threshold. "
                "No user/content label extraction. The iOS policy requires Firebase Crashlytics export to Cloud Logging "
                "(sessions export is unnecessary). Runbook: docs/DIAGNOSTICS.md\n\n"
                f"[Open logs](https://console.cloud.google.com/logs/query?project={PROJECT})"},
            "conditions": [{"displayName": title, "conditionMatchedLog": {
                "filter": query}}],
            "alertStrategy": {"notificationRateLimit": {"period": "3600s"}, "autoClose": "86400s"},
            "notificationChannels": [channel],
        })
    return specs


class MonitoringAPI:
    def __init__(self, configuration):
        result = subprocess.run(["gcloud", "--configuration=" + configuration, "auth", "print-access-token"],
                                check=True, text=True, capture_output=True)
        self.token = result.stdout.strip()
        if not self.token:
            raise RuntimeError("gcloud returned no access token")

    def request(self, method, path, payload=None):
        request = urllib.request.Request("https://monitoring.googleapis.com/v3/" + path,
            data=None if payload is None else json.dumps(payload).encode(), method=method,
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Monitoring API {method} failed with HTTP {error.code}") from None

    def list_all(self, kind):
        result, token = [], ""
        while True:
            query = urllib.parse.urlencode({"pageSize": 1000, **({"pageToken": token} if token else {})})
            page = self.request("GET", f"projects/{PROJECT}/{kind}?{query}")
            result.extend(page.get(kind, []))
            token = page.get("nextPageToken")
            if not token:
                return result


def is_owned(resource):
    return all(resource.get("userLabels", {}).get(k) == v for k, v in OWNER.items())


def reconcile(api, email):
    channels, policies = api.list_all("notificationChannels"), api.list_all("alertPolicies")
    matching = [c for c in channels if c.get("type") == "email" and c.get("enabled", True)
                and c.get("labels", {}).get("email_address", "").lower() == email.lower()]
    owned = [p for p in policies if is_owned(p)]
    for spec in policy_specs("pending"):
        if sum(p.get("userLabels", {}).get("signal") == spec["userLabels"]["signal"] for p in owned) > 1:
            raise RuntimeError("Duplicate managed policies; inspect before applying")
    operations = []
    if matching:
        channel = matching[0]
    else:
        channel = api.request("POST", f"projects/{PROJECT}/notificationChannels", {
            "type": "email", "displayName": "LociAR diagnostics email", "labels": {"email_address": email},
            "enabled": True, "userLabels": OWNER})
        operations.append("created_email_channel")
    for spec in policy_specs(channel["name"]):
        existing = next((p for p in owned if p.get("userLabels", {}).get("signal") == spec["userLabels"]["signal"]), None)
        if existing is None:
            api.request("POST", f"projects/{PROJECT}/alertPolicies", spec)
            operations.append("created_" + spec["userLabels"]["signal"])
        else:
            expected = copy.deepcopy(spec)
            if existing.get("conditions") and existing["conditions"][0].get("name"):
                expected["conditions"][0]["name"] = existing["conditions"][0]["name"]
            if any(existing.get(key) != value for key, value in expected.items()):
                mask = urllib.parse.quote(",".join(expected))
                api.request("PATCH", existing["name"] + "?updateMask=" + mask, expected)
                operations.append("updated_" + spec["userLabels"]["signal"])
    final = api.list_all("alertPolicies")
    for spec in policy_specs(channel["name"]):
        actual = next((p for p in final if is_owned(p) and p.get("userLabels", {}).get("signal") == spec["userLabels"]["signal"]), None)
        if not actual or any(actual.get(k) != spec[k] for k in ("enabled", "notificationChannels", "alertStrategy")):
            raise RuntimeError("Policy read-back verification failed")
        if actual["conditions"][0].get("conditionMatchedLog") != spec["conditions"][0]["conditionMatchedLog"]:
            raise RuntimeError("Log filter read-back verification failed")
    final_channel = api.request("GET", channel["name"])
    return {"project": PROJECT, "applied": True, "recipient": email, "channel": channel["name"],
        "channelVerificationStatus": final_channel.get("verificationStatus", "UNSPECIFIED"),
        "verifiedPolicies": len(policy_specs(channel["name"])), "operations": operations, "customMetricsCreated": 0,
        "crashlyticsExportPrerequisite": "Enable separately in Firebase Integrations; not verified by this script",
        "schedulesCreated": 0, "budgetChanges": 0, "emailDeliveryTested": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--gcloud-configuration", default="default")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", args.email):
        parser.error("A valid recipient email is required")
    result = reconcile(MonitoringAPI(args.gcloud_configuration), args.email) if args.apply else {
        "project": PROJECT, "applied": False, "policies": policy_specs("EMAIL_CHANNEL"),
        "customMetricsCreated": 0, "schedulesCreated": 0, "budgetChanges": 0}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + "\n")
        args.report.chmod(0o600)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error) if isinstance(error, RuntimeError) else "gcloud authentication failed; no credentials printed", file=sys.stderr)
        sys.exit(1)
