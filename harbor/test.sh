#!/bin/sh
set -u

test_root=${HARBOR_TEST_ROOT:-/tests}
artifact=${HARBOR_ARTIFACT:-/app/output.json}
logs=${HARBOR_VERIFIER_LOGS:-/logs/verifier}

mkdir -p "$logs"
# Harbor may also transfer candidate-owned /logs/artifacts/. This verifier
# deliberately reads only the declared artifact above and the baked judgment.
chmod a-w "$artifact"
set +e
python3 "$test_root/verifier.py" \
  --judgment "$test_root/judgment.json" \
  --artifact "$artifact" > "$logs/verdict.json"
status=$?
set -e

if [ "$status" -eq 0 ]; then
  printf '1\n' > "$logs/reward.txt"
else
  printf '0\n' > "$logs/reward.txt"
fi
cat "$logs/verdict.json"
exit "$status"
