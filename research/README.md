# Research

Record the evidence, limits, and design consequences of benchmark-related
research here. Research informs construct design; it does not silently become
Ground Truth or a candidate score.

## Reference methods

Coffee Chat adapts, rather than copies, these evaluation practices:

- [Agent Skills evaluation](https://agentskills.io/skill-creation/evaluating-skills)
  for realistic prompt/input material, clean-context paired runs, and
  preserving outputs, timing, grading, and human feedback.
- [Anthropic skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)
  for separating output quality from Skill triggering and including near-miss
  cases.
- [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
  for task-specific datasets, blind pairwise comparison, and Judge calibration
  against human labels.
- [OpenAI trace grading](https://developers.openai.com/api/docs/guides/trace-grading)
  for attributing which Skill and tool decisions produced an outcome.

The Coffee Chat-specific additions are the Roast/Brew split, explicit Bean
confirmation, and the two co-primary Brew outcomes: Human Understanding and
Agent Judgment / Action.
