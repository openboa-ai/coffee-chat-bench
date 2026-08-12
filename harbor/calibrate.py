#!/usr/bin/env python3
"""Run projected Harbor verifiers in one bounded local calibration process."""

import argparse
import contextlib
import importlib.util
import io
import json
import sys


def load_verifier(path, request_id):
    spec = importlib.util.spec_from_file_location(f"pcda_verifier_{request_id}", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load projected verifier")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_request(request):
    request_id = request["id"]
    try:
        module = load_verifier(request["verifier"], request_id)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            module.verify(request["judgment"], request["artifact"])
        verdict = json.loads(output.getvalue())
        return {"id": request_id, "verdict": verdict}
    except (KeyError, OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        return {"id": request_id, "error": str(error)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--requests", required=True)
    args = parser.parse_args()
    with open(args.requests, encoding="utf-8") as handle:
        payload = json.load(handle)
    requests = payload["requests"]
    if not isinstance(requests, list):
        raise ValueError("requests must be an array")
    print(json.dumps({"results": [run_request(request) for request in requests]}, separators=(",", ":")))


if __name__ == "__main__":
    main()
