#!/usr/bin/env python3
"""Existing logs -> email alerts. Default is a plan; --apply changes labelled resources only.
No custom metrics, schedules, exports, IAM changes, API enablement or billing changes.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "lociar-2f38c"
CONFIGURATION_NAME = re.compile(r"^[a-z][a-z0-9-]{0,62}$")
GCLOUD_CANDIDATES = ("/opt/homebrew/bin/gcloud", "/usr/local/bin/gcloud",
                     "/opt/homebrew/share/google-cloud-sdk/bin/gcloud", "/usr/bin/gcloud")
PROJECT_NUMBER = "696514892783"  # Monitoring may return resource names with the project number.
API_PATH = re.compile(r"^projects/(" + re.escape(PROJECT) + "|" + PROJECT_NUMBER + r")/[A-Za-z0-9_./-]+(\?[A-Za-z0-9_.=&%:,()\[\]'\"/ +-]*)?$")


def gcloud_binary():
    """Fixed install locations only; gcloud is never resolved through PATH."""
    for candidate in GCLOUD_CANDIDATES:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise RuntimeError("gcloud not found in a standard install location")


def safe_api_path(path):
    """Monitoring API paths must stay inside this project; '..' segments are refused."""
    if not API_PATH.match(path) or ".." in path.split("?", 1)[0].split("/"):
        raise ValueError("Refusing a Monitoring API path outside projects/" + PROJECT)
    return path


REPORT_DIRECTORY = Path(__file__).resolve().parents[1] / "build" / "monitoring"


def report_name(value):
    """Reports are plain JSON file names; they are written only into REPORT_DIRECTORY."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.json", value or "") or ".." in value:
        raise ValueError("--report takes a plain JSON file name (written to build/monitoring/)")
    return value


def write_report(filename, output):
    """Create or replace the report inside the fixed private directory only."""
    name = report_name(filename)
    REPORT_DIRECTORY.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory = os.open(REPORT_DIRECTORY, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(fd, "w") as stream:
            stream.write(output)
    finally:
        os.close(directory)
    return REPORT_DIRECTORY / name
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
        if not CONFIGURATION_NAME.match(configuration):
            raise ValueError("Invalid gcloud configuration name")
        result = subprocess.run([gcloud_binary(), "--configuration=" + configuration, "auth", "print-access-token"],
                                check=True, text=True, capture_output=True)
        self.token = result.stdout.strip()
        if not self.token:
            raise RuntimeError("gcloud returned no access token")

    def request(self, method, path, payload=None):
        request = urllib.request.Request("https://monitoring.googleapis.com/v3/" + safe_api_path(path),
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
    parser.add_argument("--report", help="JSON file name written to build/monitoring/")
    args = parser.parse_args()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", args.email):
        parser.error("A valid recipient email is required")
    result = reconcile(MonitoringAPI(args.gcloud_configuration), args.email) if args.apply else {
        "project": PROJECT, "applied": False, "policies": policy_specs("EMAIL_CHANNEL"),
        "customMetricsCreated": 0, "schedulesCreated": 0, "budgetChanges": 0}
    if args.report:
        write_report(args.report, json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error) if isinstance(error, RuntimeError) else "gcloud authentication failed; no credentials printed", file=sys.stderr)
        sys.exit(1)
