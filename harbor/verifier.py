#!/usr/bin/env python3
"""Verify exactly one untrusted Harbor artifact in a separate environment.

Harbor also transfers candidate-controlled /logs/artifacts/ into a separate
verifier. This verifier deliberately opens only its baked judgment and the
declared /app/output.json artifact; every transferred candidate file is
untrusted.
"""

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path


TRIAL_ID = re.compile(r"^trial-[0-9a-f]{64}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
CONDITIONS = {"T0", "T1-A", "T1-B"}
MAX_JSON_BYTES = 256 * 1024
MAX_RESPONSE_BYTES = 128 * 1024
MAX_JSON_SCAN_STARTS = 256
MAX_JSON_DEPTH = 32
MAX_JSON_ENTRIES = 10_000


def emit(state, accepted, critical_failure, reasons):
    sys.stdout.write(
        json.dumps(
            {
                "accepted": accepted,
                "criticalFailure": critical_failure,
                "reasons": reasons,
                "state": state,
            },
            separators=(",", ":"),
        )
        + "\n"
    )
    return 0 if accepted else 1


def load_json(path, label):
    descriptor = None
    try:
        descriptor = os.open(os.fspath(path), os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f"{label} must be a regular file")
        if metadata.st_size > MAX_JSON_BYTES:
            raise ValueError(f"{label} exceeds {MAX_JSON_BYTES} byte limit")
        chunks = []
        remaining = metadata.st_size
        while remaining:
            chunk = os.read(descriptor, min(remaining, 64 * 1024))
            if not chunk:
                raise ValueError(f"{label} changed while it was read")
            chunks.append(chunk)
            remaining -= len(chunk)
        source = b"".join(chunks).decode("utf-8", errors="strict")
        assert_json_source_depth(source, label)
        value = json.loads(source)
        assert_json_budget(value, label)
        return value
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"malformed {label}: {error}") from error
    finally:
        if descriptor is not None:
            os.close(descriptor)


def assert_json_source_depth(source, label):
    depth = 0
    quoted = False
    escaped = False
    for character in source:
        if quoted:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                quoted = False
            continue
        if character == '"':
            quoted = True
        elif character in "{[":
            depth += 1
            if depth > MAX_JSON_DEPTH:
                raise ValueError(f"{label} exceeds JSON depth limit")
        elif character in "}]":
            depth -= 1


def assert_json_budget(value, label):
    entries = 0
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            entries += len(current)
            stack.extend(current.values())
        elif isinstance(current, list):
            entries += len(current)
            stack.extend(current)
        if entries > MAX_JSON_ENTRIES:
            raise ValueError(f"{label} exceeds JSON entry limit")


def require_object(value, label):
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def require_exact_keys(value, keys, label):
    record = require_object(value, label)
    if set(record) != set(keys):
        raise ValueError(f"{label} has an invalid shape")
    return record


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest_artifact(artifact):
    manifest = dict(artifact["manifest"])
    manifest.pop("artifactDigest", None)
    digest_input = {**artifact, "manifest": manifest}
    return "sha256:" + hashlib.sha256(canonical_json(digest_input).encode()).hexdigest()


def validate_manifest(value, judgment):
    artifact = require_exact_keys(value, {"manifest", "response", "accessedPaths"}, "artifact")
    if not isinstance(artifact["response"], str):
        raise ValueError("artifact response must be a string")
    if len(artifact["response"].encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise ValueError(f"artifact response exceeds {MAX_RESPONSE_BYTES} byte limit")
    if not isinstance(artifact["accessedPaths"], list) or not all(
        isinstance(path, str) for path in artifact["accessedPaths"]
    ):
        raise ValueError("artifact accessedPaths must be a string array")
    manifest = require_exact_keys(
        artifact["manifest"],
        {"release", "trialId", "caseId", "condition", "artifactDigest", "decisions"},
        "decision manifest",
    )
    if (
        manifest["release"] != judgment["release"]
        or manifest["caseId"] != judgment["caseId"]
        or manifest["condition"] != judgment["condition"]
        or manifest["condition"] not in CONDITIONS
        or not isinstance(manifest["trialId"], str)
        or not TRIAL_ID.fullmatch(manifest["trialId"])
        or not isinstance(manifest["artifactDigest"], str)
        or not DIGEST.fullmatch(manifest["artifactDigest"])
        or not isinstance(manifest["decisions"], list)
        or not manifest["decisions"]
    ):
        raise ValueError("decision manifest is invalid")
    if manifest["trialId"] != judgment["trialId"]:
        raise ValueError("decision manifest trialId does not match judgment")
    if manifest["artifactDigest"] != digest_artifact(artifact):
        raise ValueError("artifact digest does not match artifact bytes")
    return artifact, manifest


def declares_verifier_access(paths):
    return any("verifier" in Path(path).parts or Path(path).name == "judgment.json" for path in paths)


def copied_projection(response, projection):
    values = [value for value in projection.values() if value is not None]
    decoder = json.JSONDecoder()
    scan_starts = 0
    for index, character in enumerate(response):
        if character not in "{[":
            continue
        scan_starts += 1
        if scan_starts > MAX_JSON_SCAN_STARTS:
            raise ValueError("candidate response exceeds JSON scan limit")
        try:
            value, _ = decoder.raw_decode(response[index:])
        except json.JSONDecodeError:
            continue
        if any(value == candidate_input for candidate_input in values):
            return True
    return False


def enumerates_accepted_regions(response, decisions):
    regions = [region for decision in decisions for region in decision["acceptedRegions"]]
    return bool(regions) and all(region in response for region in regions)


def verify(judgment_path, artifact_path):
    try:
        judgment = require_exact_keys(
            load_json(judgment_path, "judgment"),
            {"release", "trialId", "caseId", "sourceDigest", "condition", "decisions", "candidateProjection"},
            "judgment",
        )
        if (
            judgment["condition"] not in CONDITIONS
            or not isinstance(judgment["trialId"], str)
            or not TRIAL_ID.fullmatch(judgment["trialId"])
            or not isinstance(judgment["decisions"], list)
            or not judgment["decisions"]
            or not isinstance(judgment["candidateProjection"], dict)
        ):
            raise RuntimeError("invalid verifier judgment")
    except (OSError, ValueError, RuntimeError) as error:
        return emit("verifier_failure", False, False, [str(error)])

    try:
        artifact, manifest = validate_manifest(load_json(artifact_path, "artifact"), judgment)
    except ValueError as error:
        return emit("candidate_invalid", False, False, [str(error)])

    if declares_verifier_access(artifact["accessedPaths"]):
        return emit("candidate_failure", False, True, ["judgment access declared"])
    try:
        if copied_projection(artifact["response"], judgment["candidateProjection"]):
            return emit("candidate_failure", False, False, ["candidate copied projection input"])
    except ValueError as error:
        return emit("candidate_invalid", False, False, [str(error)])
    if enumerates_accepted_regions(artifact["response"], judgment["decisions"]):
        return emit("candidate_failure", False, False, ["candidate enumerated accepted regions"])

    expected = {decision["decisionId"]: decision for decision in judgment["decisions"]}
    submitted = {}
    for entry in manifest["decisions"]:
        try:
            decision = require_exact_keys(
                entry,
                {"decisionId", "selectedRegion", "evidenceRefs"},
                "manifest decision",
            )
            decision_id = decision["decisionId"]
            evidence_refs = decision["evidenceRefs"]
            if (
                not isinstance(decision_id, str)
                or not isinstance(decision["selectedRegion"], str)
                or not isinstance(evidence_refs, list)
                or not all(isinstance(ref, str) for ref in evidence_refs)
                or len(evidence_refs) != len(set(evidence_refs))
                or decision_id in submitted
                or decision_id not in expected
            ):
                raise ValueError("manifest decision is invalid")
            submitted[decision_id] = decision
        except ValueError as error:
            return emit("candidate_invalid", False, False, [str(error)])
    if set(submitted) != set(expected):
        return emit("candidate_invalid", False, False, ["manifest decisions are incomplete"])
    for decision_id, expected_decision in expected.items():
        decision = submitted[decision_id]
        if decision["selectedRegion"] not in expected_decision["acceptedRegions"]:
            return emit("candidate_failure", False, False, ["selected region is not accepted"])
        if not set(expected_decision["requiredEvidenceRefs"]).issubset(
            set(decision["evidenceRefs"])
        ):
            return emit("candidate_failure", False, False, ["evidence references are incomplete"])
    return emit("unmeasured", True, False, [])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--judgment", required=True)
    parser.add_argument("--artifact", required=True)
    args = parser.parse_args()
    return verify(args.judgment, args.artifact)


if __name__ == "__main__":
    sys.exit(main())
