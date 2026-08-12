# Remaining Judge Budget Plan

**Goal:** Let Eval reduce Bench's judge campaign cap to the exact budget left
after candidate execution, so the combined candidate-plus-judge run cannot
exceed USD 50.

- Eval supplies `COFFEE_CHAT_EVAL_JUDGE_CAP_NANO_USD` only to the host-side
  `judge` process; Bench deletes it immediately.
- The value must be a non-negative safe integer no greater than the pinned
  campaign cap. It changes only the campaign cap, never tariffs, roster, token
  limits, or rubric.
- Missing input retains the checked-in cap for direct library/test use. The
  Eval live runner is responsible for requiring an explicit remaining cap.
- Prove a lower cap stops before provider requests and is reflected in the
  campaign receipt. No provider call is permitted in tests.
