# SDD ledger — plan: /Users/sangjoon/Coding/coffee-chat/.codex-plans/2026-08-12-pcda-benchmark-activation.md

Baseline Bench: ff2e760a7a24127ef0caef6bf30eb91ede0ab2e1; inactive boundary and 8/8 tests passed.
Baseline Eval: 78361b5fb3d9b20af233a44898ea1838a49ffa45; format, typecheck, 23/23 tests, dry-run, smoke, canary check, and policy passed.

Task 1: fix round 1/5 (2 addressed, 2 remained; commits 37ccf27..19af3b4).
Task 1: fix round 2/5 (2 remaining findings addressed; commit 1ed5225).
Task 1: complete (commits ff2e760..1ed5225; checker passed, 18/18 tests passed, final independent review CLEAN).
Task 2: fix round 1/5 (4 Important and 1 Minor addressed; commit 7d9acaa).
Task 2: complete (commits 1ed5225..7d9acaa; 38/38 tests passed, final independent review CLEAN).
Task 3A: fix round 1/5 (Critical fixture bypass and error-loss finding addressed; commit 3778ab2).
Task 3B: fix rounds 1-2/5 (runtime isolation, verifier integrity, Harbor transfer contract, and build context addressed; commits 063cb62 and a22228c).
Task 3: complete (commits 7d9acaa..a22228c; 57/57 tests passed, generated verifier Docker context built, final independent review CLEAN).
Task 4A: fix round 1/5 (public output contract and trial binding addressed; commit 126f4f4).
Task 4A: complete (commits a22228c..126f4f4; 65/65 tests passed, final independent review CLEAN).
Task 4B: fix round 1/5 (exact campaign, all-record uniqueness, strict parsing addressed; commit ef3bceb).
Task 4B: complete (commits 126f4f4..ef3bceb; 79/79 tests passed, final independent review CLEAN).
Task 4C1: complete (commits 80aee6b..01c1e4c; source materialization, generated campaign parity, and source/schema fixes recorded in task-4c1-report.md).
Task 4C2: complete (committed campaign parity and full 288-condition x 3-control projected-verifier calibration recorded in task-4c2-report.md).
Task 4C2: Important calibration-failure retention fix complete (per-projection case/family/condition/trial/source identities, partial projection preservation, fixed 288/864 denominators, 5/5 focused and 99/99 full tests; evidence appended to task-4c2-report.md).
Task 5B: complete pending focused commit. Superseded three-model/six-vote judge contract replaced with exact Terra/Luna two-slot judging and a hard USD 50 integer-nano-USD campaign boundary. Added fake-transport Responses API, panel, campaign-cost, receipt-digest, validity-completeness, and provenance-state tests; no live provider call. Format/typecheck passed; 20/20 focused, 113/113 full Node, and 21/21 explicit inactive-boundary tests passed; inactive checker and diff check passed.
Task 5B fix round 1: complete (commit 5da09d9ba9dd2ad49f829a40716a67062d5952d7). Public config/schema runtime parsing now drives roster, request/retry format, cap, tariff conversion, and canonical config/tariff receipt digests; schema/runtime mutation parity is covered. Usage failure closes the budget while emitting `budget_stopped` votes for every remaining Terra/Luna slot across remaining atoms, preserving `insufficient_votes` with zero additional calls. Format/typecheck passed; 22/22 focused, 115/115 full Node, and 21/21 explicit inactive-boundary tests passed; inactive checker and diff check passed.
Task 5B fix round 2: execution validates the complete public config before cost or transport; structured QPCFR dimensions now project to schema-valid public judge votes and explicit measured/disagreement/unavailable result states. Harbor source projection remains Bench-owned, while actual mount/transfer/network/cleanup attestation is explicitly required from Eval Task 6. Typecheck and 121/121 full Node tests passed; no provider call.
Task 5B final re-review: RESOLVED at e1de896462610188b380bb796157046f26117bed; safe to publish as a not_active foundation, with live host-isolation proof explicitly deferred to Eval Task 6.
