export function fullEntries(steps = []) {
  return steps.filter((entry) => entry.runKind !== "mini");
}

export function budgetUsed(steps = []) {
  return fullEntries(steps).filter((entry) => entry.gateDecision !== "baseline")
    .length;
}

export function latestFullStepId(steps = []) {
  return fullEntries(steps).at(-1)?.stepId ?? null;
}

export function miniBatchesSinceFull(miniSteps = [], fullStepId) {
  return miniSteps.filter((entry) => entry.parentFullStepId === fullStepId)
    .length;
}

export function assertFullIterationAvailable(steps, policy) {
  const used = budgetUsed(steps);
  if (used >= policy.fullIterationBudget)
    throw new TypeError(
      `full iteration budget exhausted (${used}/${policy.fullIterationBudget})`,
    );
  return { used, remaining: policy.fullIterationBudget - used };
}

export function assertMiniBatchAvailable(miniSteps, fullStepId, policy) {
  const used = miniBatchesSinceFull(miniSteps, fullStepId);
  if (used >= policy.miniBatchLimitBetweenFull)
    throw new TypeError(
      `mini batch limit exhausted (${used}/${policy.miniBatchLimitBetweenFull})`,
    );
  return {
    used,
    remaining: policy.miniBatchLimitBetweenFull - used,
  };
}
