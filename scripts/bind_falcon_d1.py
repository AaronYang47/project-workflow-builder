#!/usr/bin/env python3
"""Add FALCON_DB to project-workflow-builder Pages without replacing workflow DB."""
import json
import re
import urllib.request
from pathlib import Path

ACCOUNT = "74551a1c89edeca31db745a2d091bee4"
PROJECT = "project-workflow-builder"
WORKFLOW_DB = "86e1d86d-52a3-4134-934f-2b495344f9bc"
FALCON_DB = "a3b49f49-e6b8-41f2-a0a7-fb9a70dd6c9a"


def token():
    cfg = Path.home().joinpath("Library/Preferences/.wrangler/config/default.toml").read_text()
    return re.search(r'oauth_token\s*=\s*"([^"]+)"', cfg).group(1)


def main():
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/pages/projects/{PROJECT}"
    headers = {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}
    with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": headers["Authorization"]})) as resp:
        current = json.load(resp)["result"]["deployment_configs"]
    prod = current.get("production") or {}
    preview = current.get("preview") or {}
    d1 = {"DB": {"id": WORKFLOW_DB}, "FALCON_DB": {"id": FALCON_DB}}
    production_patch = {"d1_databases": d1}
    if prod.get("r2_buckets"):
        production_patch["r2_buckets"] = prod["r2_buckets"]
    preview_patch = {"d1_databases": d1}
    if preview.get("r2_buckets"):
        preview_patch["r2_buckets"] = preview["r2_buckets"]
    body = json.dumps({"deployment_configs": {"production": production_patch, "preview": preview_patch}}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.load(resp)
    if not data.get("success"):
        raise SystemExit(data.get("errors"))
    dc = data["result"]["deployment_configs"]
    for env_name, env in dc.items():
        d1b = (env or {}).get("d1_databases") or {}
        print(env_name, {k: v.get("id") for k, v in d1b.items()})


if __name__ == "__main__":
    main()
