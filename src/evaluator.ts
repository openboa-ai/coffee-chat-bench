import {
  renderCase,
  validateCandidateSubmission,
  type CandidateSubmission,
  type CandidateSubmissionValidation,
  type CandidateTask,
} from "./artifact.ts";
import {
  parseCaseManifest,
  RELEASE_ID,
  stableDigest,
  type BenchmarkCondition,
  type CaseManifest,
  type Digest,
} from "./contracts.ts";
import {
  createPairwiseRequest,
  createPointwiseRequest,
  DEFAULT_JUDGE_PROTOCOL,
  EVALUATION_DIMENSIONS,
  parseJudgeResponse,
  parsePairwiseResponse,
  protocolDigest,
  type EvaluationDimension,
  type JudgeCompletion,
  type JudgeProtocol,
  type JudgeRequest,
  type JudgeTransport,
  type OrdinalScore,
  type PairwiseComparisonKind,
  type PairwiseOrientation,
  type PairwisePreference,
  type StatedRationaleAlignmentScore,
} from "./judge-protocol.ts";

export {
  DEFAULT_JUDGE_PROTOCOL,
  EVALUATION_DIMENSIONS,
  protocolDigest,
} from "./judge-protocol.ts";
export type {
  EvaluationDimension,
  JudgeCompletion,
  JudgeProtocol,
  JudgeRequest,
  JudgeTransport,
  OrdinalScore,
  PairwiseComparisonKind,
  PairwiseOrientation,
  PairwisePreference,
  StatedRationaleAlignmentScore,
} from "./judge-protocol.ts";

export type EvaluationState =
  | "measured"
  | "invalid"
  | "unavailable"
  | "abstained"
  | "not_applicable"
  | "unmeasured"
  | "order_inconsistent";

export interface BenchmarkInput {
  readonly release: typeof RELEASE_ID;
  readonly caseId: string;
  readonly condition: BenchmarkCondition;
  readonly caseDigest: Digest;
  readonly candidate: CandidateTask;
  readonly inputDigest: Digest;
}

export interface JudgeProvenance {
  readonly inputDigest: Digest;
  readonly artifactDigests: readonly Digest[];
  readonly decisionRecordDigest: Digest | null;
  readonly protocolDigest: Digest;
  readonly requestDigest: Digest | null;
  readonly responseDigest: Digest | null;
  readonly transportMetadata?: Readonly<
    Record<string, string | number | boolean>
  >;
}

export type ScoreEvaluation<T> =
  | {
      readonly state: "measured";
      readonly score: T;
      readonly rationale: string;
      readonly provenance: JudgeProvenance;
    }
  | {
      readonly state: "invalid" | "unavailable" | "abstained";
      readonly cause: string;
      readonly provenance: JudgeProvenance;
    }
  | {
      readonly state: "not_applicable";
      readonly reason: string;
      readonly provenance: JudgeProvenance;
    }
  | {
      readonly state: "unmeasured";
      readonly reason: string;
      readonly provenance: JudgeProvenance;
    };

export type HardConstraintEvaluation =
  | {
      readonly state: "measured";
      readonly detected: boolean;
      readonly rationale: string;
      readonly provenance: JudgeProvenance;
    }
  | {
      readonly state: "invalid" | "unavailable" | "abstained";
      readonly cause: string;
      readonly provenance: JudgeProvenance;
    }
  | {
      readonly state: "unmeasured";
      readonly reason: string;
      readonly provenance: JudgeProvenance;
    };

export interface SubmissionEvaluation {
  readonly input: BenchmarkInput;
  readonly submission: CandidateSubmission | null;
  readonly objective:
    | CandidateSubmissionValidation
    | { readonly state: "unmeasured"; readonly reason: string };
  readonly judgmentAlignment: ScoreEvaluation<OrdinalScore>;
  readonly statedRationaleAlignment: ScoreEvaluation<StatedRationaleAlignmentScore>;
  readonly taskPerformance: ScoreEvaluation<OrdinalScore>;
  readonly evidenceGrounding: ScoreEvaluation<OrdinalScore>;
  readonly hardConstraintViolation: HardConstraintEvaluation;
  readonly status:
    "measured" | "invalid" | "unavailable" | "abstained" | "unmeasured";
  readonly provenance: {
    readonly inputDigest: Digest;
    readonly artifactDigest: Digest | null;
    readonly decisionRecordDigest: Digest | null;
    readonly submissionDigest: Digest | null;
    readonly protocolDigest: Digest;
  };
}

export interface PairwiseAttempt {
  readonly orientation: PairwiseOrientation;
  readonly state: "measured" | "invalid" | "unavailable" | "abstained";
  readonly preferred?: PairwisePreference;
  readonly rationale?: string;
  readonly cause?: string;
  readonly provenance: JudgeProvenance;
}

export type PairwiseEvaluation =
  | {
      readonly state: "measured";
      readonly preference: "first" | "second" | "tie";
      readonly attempts: readonly [PairwiseAttempt, PairwiseAttempt];
    }
  | {
      readonly state: "order_inconsistent";
      readonly cause: string;
      readonly attempts: readonly [PairwiseAttempt, PairwiseAttempt];
    }
  | {
      readonly state: "invalid" | "unavailable" | "abstained";
      readonly cause: string;
      readonly attempts: readonly PairwiseAttempt[];
    }
  | {
      readonly state: "unmeasured";
      readonly reason: string;
      readonly attempts: readonly [];
    };

export type BoundaryConvergenceEvaluation =
  | {
      readonly state: "measured";
      readonly converged: boolean;
      readonly targetATie: boolean;
      readonly targetBTie: boolean;
      readonly sharedConstraintCompliance: boolean;
    }
  | {
      readonly state: "not_applicable";
      readonly reason: string;
    }
  | {
      readonly state:
        | "invalid"
        | "unavailable"
        | "abstained"
        | "unmeasured"
        | "order_inconsistent";
      readonly cause: string;
    };

export interface CaseFamilySubmissions {
  readonly unconditioned?: CandidateSubmission;
  readonly target_a?: CandidateSubmission;
  readonly target_b?: CandidateSubmission;
}

export interface CaseFamilyEvaluation {
  readonly caseId: string;
  readonly submissionEvaluations: readonly SubmissionEvaluation[];
  readonly conditioningEffect: {
    readonly targetA: PairwiseEvaluation;
    readonly targetB: PairwiseEvaluation;
  };
  readonly targetSpecificity: {
    readonly targetA: PairwiseEvaluation;
    readonly targetB: PairwiseEvaluation;
  };
  readonly boundaryConvergence: BoundaryConvergenceEvaluation;
}

function candidateInput(task: CandidateTask) {
  return {
    release: task.release,
    instruction: task.instruction,
    environment: task.environment,
    deliverables: task.deliverables,
    hardConstraints: task.hardConstraints,
    output: task.output,
    documents: task.documents,
    context: task.context,
  };
}

export function getBenchmarkInput(
  manifestValue: CaseManifest,
  condition: BenchmarkCondition,
): BenchmarkInput {
  const manifest = parseCaseManifest(manifestValue);
  const candidate = renderCase(manifest, { condition });
  const visibleInput = candidateInput(candidate);
  return {
    release: RELEASE_ID,
    caseId: manifest.caseId,
    condition,
    caseDigest: manifest.manifestDigest,
    candidate,
    inputDigest: stableDigest({
      release: RELEASE_ID,
      caseId: manifest.caseId,
      condition,
      candidateInput: visibleInput,
    }),
  };
}

function baseProvenance(
  input: BenchmarkInput,
  protocol: JudgeProtocol,
  digests?: {
    readonly artifactDigest?: Digest | null;
    readonly decisionRecordDigest?: Digest | null;
  },
): JudgeProvenance {
  return {
    inputDigest: input.inputDigest,
    artifactDigests: digests?.artifactDigest ? [digests.artifactDigest] : [],
    decisionRecordDigest: digests?.decisionRecordDigest ?? null,
    protocolDigest: protocolDigest(protocol),
    requestDigest: null,
    responseDigest: null,
  };
}

function requestProvenance(
  request: JudgeRequest,
  completion: JudgeCompletion | null,
): JudgeProvenance {
  const artifactDigests =
    request.kind === "pointwise"
      ? [request.artifactDigest]
      : [request.leftArtifactDigest, request.rightArtifactDigest];
  const provenance: JudgeProvenance = {
    inputDigest: request.inputDigest,
    artifactDigests,
    decisionRecordDigest:
      request.kind === "pointwise" ? request.decisionRecordDigest : null,
    protocolDigest: request.protocolDigest,
    requestDigest: stableDigest(request),
    responseDigest: completion ? stableDigest(completion.raw) : null,
  };
  if (completion?.metadata !== undefined)
    return { ...provenance, transportMetadata: completion.metadata };
  return provenance;
}

function failedScore(
  state: "invalid" | "unavailable" | "abstained",
  cause: string,
  provenance: JudgeProvenance,
): ScoreEvaluation<never> {
  return { state, cause, provenance };
}

function failedConstraint(
  state: "invalid" | "unavailable" | "abstained",
  cause: string,
  provenance: JudgeProvenance,
): HardConstraintEvaluation {
  return { state, cause, provenance };
}

function notApplicable<T>(provenance: JudgeProvenance): ScoreEvaluation<T> {
  return {
    state: "not_applicable",
    reason: "no target judgment history was supplied",
    provenance,
  };
}

async function judgePointwise(
  request: Extract<JudgeRequest, { readonly kind: "pointwise" }>,
  transport: JudgeTransport,
): Promise<
  | ScoreEvaluation<OrdinalScore | StatedRationaleAlignmentScore>
  | HardConstraintEvaluation
> {
  let completion: JudgeCompletion;
  try {
    completion = await transport.complete(request);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    const provenance = requestProvenance(request, null);
    return request.dimension === "hard_constraint_violation"
      ? failedConstraint("unavailable", cause, provenance)
      : failedScore("unavailable", cause, provenance);
  }
  const provenance = requestProvenance(request, completion);
  try {
    const parsed = parseJudgeResponse(completion.raw, request.dimension);
    if (parsed.kind === "abstain")
      return request.dimension === "hard_constraint_violation"
        ? failedConstraint("abstained", parsed.reason, provenance)
        : failedScore("abstained", parsed.reason, provenance);
    if (parsed.kind === "hard_constraint_violation")
      return {
        state: "measured",
        detected: parsed.detected,
        rationale: parsed.rationale,
        provenance,
      };
    return {
      state: "measured",
      score: parsed.score,
      rationale: parsed.rationale,
      provenance,
    };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    return request.dimension === "hard_constraint_violation"
      ? failedConstraint("invalid", cause, provenance)
      : failedScore("invalid", cause, provenance);
  }
}

function aggregateStatus(
  results: readonly (ScoreEvaluation<unknown> | HardConstraintEvaluation)[],
): SubmissionEvaluation["status"] {
  if (results.some(({ state }) => state === "invalid")) return "invalid";
  if (results.some(({ state }) => state === "unavailable"))
    return "unavailable";
  if (results.some(({ state }) => state === "abstained")) return "abstained";
  if (results.some(({ state }) => state === "unmeasured")) return "unmeasured";
  return "measured";
}

function invalidSubmissionEvaluation(input: {
  readonly benchmarkInput: BenchmarkInput;
  readonly submission: CandidateSubmission;
  readonly validation: Extract<
    CandidateSubmissionValidation,
    { readonly state: "invalid" }
  >;
  readonly protocol: JudgeProtocol;
}): SubmissionEvaluation {
  const provenance = baseProvenance(input.benchmarkInput, input.protocol);
  const invalid = failedScore("invalid", input.validation.cause, provenance);
  const hardInvalid = failedConstraint(
    "invalid",
    input.validation.cause,
    provenance,
  );
  return {
    input: input.benchmarkInput,
    submission: input.submission,
    objective: input.validation,
    judgmentAlignment:
      input.benchmarkInput.condition === "unconditioned"
        ? notApplicable(provenance)
        : invalid,
    statedRationaleAlignment:
      input.benchmarkInput.condition === "unconditioned"
        ? notApplicable(provenance)
        : invalid,
    taskPerformance: invalid,
    evidenceGrounding: invalid,
    hardConstraintViolation: hardInvalid,
    status: "invalid",
    provenance: {
      inputDigest: input.benchmarkInput.inputDigest,
      artifactDigest: null,
      decisionRecordDigest: null,
      submissionDigest: null,
      protocolDigest: protocolDigest(input.protocol),
    },
  };
}

export async function evaluateSubmission(input: {
  readonly input: BenchmarkInput;
  readonly submission: CandidateSubmission;
  readonly transport: JudgeTransport;
  readonly protocol?: JudgeProtocol;
}): Promise<SubmissionEvaluation> {
  const protocol = input.protocol ?? DEFAULT_JUDGE_PROTOCOL;
  const validation = validateCandidateSubmission(
    input.input.candidate,
    input.submission,
  );
  if (validation.state === "invalid")
    return invalidSubmissionEvaluation({
      benchmarkInput: input.input,
      submission: input.submission,
      validation,
      protocol,
    });

  const provenance = baseProvenance(input.input, protocol, {
    artifactDigest: validation.artifact.digest,
    decisionRecordDigest: validation.decisionRecord.digest,
  });
  const run = async (dimension: EvaluationDimension) =>
    judgePointwise(
      createPointwiseRequest({
        protocol,
        dimension,
        candidateInput: candidateInput(input.input.candidate),
        candidateArtifact: input.submission.artifact.content,
        ...(dimension === "stated_rationale_alignment"
          ? { decisionRecord: input.submission.decisionRecord }
          : {}),
        inputDigest: input.input.inputDigest,
        artifactDigest: validation.artifact.digest,
        decisionRecordDigest:
          dimension === "stated_rationale_alignment"
            ? validation.decisionRecord.digest
            : null,
      }),
      input.transport,
    );

  const targetConditioned = input.input.condition !== "unconditioned";
  const judgmentAlignment = targetConditioned
    ? ((await run("judgment_alignment")) as ScoreEvaluation<OrdinalScore>)
    : notApplicable<OrdinalScore>(provenance);
  const statedRationaleAlignment = targetConditioned
    ? ((await run(
        "stated_rationale_alignment",
      )) as ScoreEvaluation<StatedRationaleAlignmentScore>)
    : notApplicable<StatedRationaleAlignmentScore>(provenance);
  const taskPerformance = (await run(
    "task_performance",
  )) as ScoreEvaluation<OrdinalScore>;
  const evidenceGrounding = (await run(
    "evidence_grounding",
  )) as ScoreEvaluation<OrdinalScore>;
  const hardConstraintViolation = (await run(
    "hard_constraint_violation",
  )) as HardConstraintEvaluation;
  const status = aggregateStatus([
    judgmentAlignment,
    statedRationaleAlignment,
    taskPerformance,
    evidenceGrounding,
    hardConstraintViolation,
  ]);
  return {
    input: input.input,
    submission: input.submission,
    objective: validation,
    judgmentAlignment,
    statedRationaleAlignment,
    taskPerformance,
    evidenceGrounding,
    hardConstraintViolation,
    status,
    provenance: {
      inputDigest: input.input.inputDigest,
      artifactDigest: validation.artifact.digest,
      decisionRecordDigest: validation.decisionRecord.digest,
      submissionDigest: validation.submissionDigest,
      protocolDigest: protocolDigest(protocol),
    },
  };
}

export type PointwiseResult =
  | ScoreEvaluation<OrdinalScore | StatedRationaleAlignmentScore>
  | HardConstraintEvaluation;

export interface PointwiseEvaluation {
  readonly input: BenchmarkInput;
  readonly submission: CandidateSubmission;
  readonly objective: CandidateSubmissionValidation;
  readonly dimension: EvaluationDimension;
  readonly request: Extract<
    JudgeRequest,
    { readonly kind: "pointwise" }
  > | null;
  readonly result: PointwiseResult;
}

function pointwiseResult(
  evaluation: SubmissionEvaluation,
  dimension: EvaluationDimension,
): PointwiseResult {
  switch (dimension) {
    case "judgment_alignment":
      return evaluation.judgmentAlignment;
    case "stated_rationale_alignment":
      return evaluation.statedRationaleAlignment;
    case "task_performance":
      return evaluation.taskPerformance;
    case "evidence_grounding":
      return evaluation.evidenceGrounding;
    case "hard_constraint_violation":
      return evaluation.hardConstraintViolation;
  }
}

/**
 * Evaluate exactly one pointwise dimension for a candidate submission.
 * Qualification and hill-climbing use this narrow path so one
 * example-dimension row maps to one Judge call; the full case-family API
 * remains responsible for the complete product evaluation and mirrored
 * pairwise comparisons.
 */
export async function evaluatePointwise(input: {
  readonly benchmarkInput: BenchmarkInput;
  readonly submission: CandidateSubmission;
  readonly dimension: EvaluationDimension;
  readonly transport: JudgeTransport;
  readonly protocol?: JudgeProtocol;
}): Promise<PointwiseEvaluation> {
  const protocol = input.protocol ?? DEFAULT_JUDGE_PROTOCOL;
  const validation = validateCandidateSubmission(
    input.benchmarkInput.candidate,
    input.submission,
  );
  if (validation.state === "invalid") {
    const invalid = invalidSubmissionEvaluation({
      benchmarkInput: input.benchmarkInput,
      submission: input.submission,
      validation,
      protocol,
    });
    return {
      input: input.benchmarkInput,
      submission: input.submission,
      objective: validation,
      dimension: input.dimension,
      request: null,
      result: pointwiseResult(invalid, input.dimension),
    };
  }

  if (
    input.benchmarkInput.condition === "unconditioned" &&
    (input.dimension === "judgment_alignment" ||
      input.dimension === "stated_rationale_alignment")
  ) {
    return {
      input: input.benchmarkInput,
      submission: input.submission,
      objective: validation,
      dimension: input.dimension,
      request: null,
      result: notApplicable(
        baseProvenance(input.benchmarkInput, protocol, {
          artifactDigest: validation.artifact.digest,
          decisionRecordDigest: validation.decisionRecord.digest,
        }),
      ),
    };
  }

  const request = createPointwiseRequest({
    protocol,
    dimension: input.dimension,
    candidateInput: candidateInput(input.benchmarkInput.candidate),
    candidateArtifact: input.submission.artifact.content,
    ...(input.dimension === "stated_rationale_alignment"
      ? { decisionRecord: input.submission.decisionRecord }
      : {}),
    inputDigest: input.benchmarkInput.inputDigest,
    artifactDigest: validation.artifact.digest,
    decisionRecordDigest:
      input.dimension === "stated_rationale_alignment"
        ? validation.decisionRecord.digest
        : null,
  });
  return {
    input: input.benchmarkInput,
    submission: input.submission,
    objective: validation,
    dimension: input.dimension,
    request,
    result: await judgePointwise(request, input.transport),
  };
}

function missingSubmissionEvaluation(
  input: BenchmarkInput,
  protocol: JudgeProtocol,
): SubmissionEvaluation {
  const provenance = baseProvenance(input, protocol);
  const reason = "producer did not supply a candidate submission";
  const unmeasured: ScoreEvaluation<never> = {
    state: "unmeasured",
    reason,
    provenance,
  };
  return {
    input,
    submission: null,
    objective: { state: "unmeasured", reason },
    judgmentAlignment:
      input.condition === "unconditioned"
        ? notApplicable(provenance)
        : unmeasured,
    statedRationaleAlignment:
      input.condition === "unconditioned"
        ? notApplicable(provenance)
        : unmeasured,
    taskPerformance: unmeasured,
    evidenceGrounding: unmeasured,
    hardConstraintViolation: { state: "unmeasured", reason, provenance },
    status: "unmeasured",
    provenance: {
      inputDigest: input.inputDigest,
      artifactDigest: null,
      decisionRecordDigest: null,
      submissionDigest: null,
      protocolDigest: protocolDigest(protocol),
    },
  };
}

function pairwisePrecondition(
  evaluations: readonly SubmissionEvaluation[],
): PairwiseEvaluation | undefined {
  if (evaluations.some(({ status }) => status === "invalid"))
    return {
      state: "invalid",
      cause: "a required candidate submission is invalid",
      attempts: [],
    };
  if (evaluations.some(({ status }) => status === "unmeasured"))
    return {
      state: "unmeasured",
      reason: "a required candidate submission is missing",
      attempts: [],
    };
  return undefined;
}

async function pairwiseAttempt(
  request: Extract<JudgeRequest, { readonly kind: "pairwise" }>,
  transport: JudgeTransport,
): Promise<PairwiseAttempt> {
  let completion: JudgeCompletion;
  try {
    completion = await transport.complete(request);
  } catch (error) {
    return {
      orientation: request.orientation,
      state: "unavailable",
      cause: error instanceof Error ? error.message : String(error),
      provenance: requestProvenance(request, null),
    };
  }
  const provenance = requestProvenance(request, completion);
  try {
    const parsed = parsePairwiseResponse(completion.raw);
    if (parsed.kind === "abstain")
      return {
        orientation: request.orientation,
        state: "abstained",
        cause: parsed.reason,
        provenance,
      };
    return {
      orientation: request.orientation,
      state: "measured",
      preferred: parsed.preferred,
      rationale: parsed.rationale,
      provenance,
    };
  } catch (error) {
    return {
      orientation: request.orientation,
      state: "invalid",
      cause: error instanceof Error ? error.message : String(error),
      provenance,
    };
  }
}

function normalizedPreference(attempt: PairwiseAttempt) {
  if (attempt.state !== "measured" || attempt.preferred === undefined)
    return undefined;
  if (attempt.preferred === "tie") return "tie" as const;
  if (attempt.orientation === "canonical")
    return attempt.preferred === "left"
      ? ("first" as const)
      : ("second" as const);
  return attempt.preferred === "left"
    ? ("second" as const)
    : ("first" as const);
}

function pairwiseFailureState(
  attempts: readonly [PairwiseAttempt, PairwiseAttempt],
): PairwiseEvaluation | undefined {
  for (const state of ["invalid", "unavailable", "abstained"] as const) {
    const failed = attempts.find((attempt) => attempt.state === state);
    if (failed)
      return {
        state,
        cause: failed.cause ?? `pairwise ${state}`,
        attempts,
      };
  }
  return undefined;
}

async function evaluatePairwise(input: {
  readonly comparison: PairwiseComparisonKind;
  readonly perspective: BenchmarkInput;
  readonly first: SubmissionEvaluation;
  readonly second: SubmissionEvaluation;
  readonly transport: JudgeTransport;
  readonly protocol: JudgeProtocol;
}): Promise<PairwiseEvaluation> {
  const precondition = pairwisePrecondition([input.first, input.second]);
  if (precondition) return precondition;
  if (
    input.first.submission === null ||
    input.second.submission === null ||
    input.first.objective.state !== "valid" ||
    input.second.objective.state !== "valid"
  )
    return {
      state: "unmeasured",
      reason: "pairwise artifacts are unavailable",
      attempts: [],
    };
  const artifactOne = {
    content: input.first.submission.artifact.content,
    digest: input.first.objective.artifact.digest,
  };
  const artifactTwo = {
    content: input.second.submission.artifact.content,
    digest: input.second.objective.artifact.digest,
  };
  const makeRequest = (orientation: PairwiseOrientation) =>
    createPairwiseRequest({
      protocol: input.protocol,
      comparison: input.comparison,
      orientation,
      candidateInput: candidateInput(input.perspective.candidate),
      firstArtifact: artifactOne,
      secondArtifact: artifactTwo,
      inputDigest: input.perspective.inputDigest,
    });
  const canonical = await pairwiseAttempt(
    makeRequest("canonical"),
    input.transport,
  );
  const mirrored = await pairwiseAttempt(
    makeRequest("mirrored"),
    input.transport,
  );
  const attempts = [canonical, mirrored] as const;
  const failure = pairwiseFailureState(attempts);
  if (failure) return failure;
  const first = normalizedPreference(canonical);
  const second = normalizedPreference(mirrored);
  if (first === undefined || second === undefined)
    return {
      state: "invalid",
      cause: "pairwise result is missing a normalized preference",
      attempts,
    };
  if (first !== second)
    return {
      state: "order_inconsistent",
      cause: "canonical and mirrored orders select different artifacts",
      attempts,
    };
  return { state: "measured", preference: first, attempts };
}

function boundaryConvergence(
  manifest: CaseManifest,
  targetSpecificity: {
    readonly targetA: PairwiseEvaluation;
    readonly targetB: PairwiseEvaluation;
  },
  targetA: SubmissionEvaluation,
  targetB: SubmissionEvaluation,
): BoundaryConvergenceEvaluation {
  if (manifest.transferType !== "boundary_condition")
    return {
      state: "not_applicable",
      reason: "this case is not a boundary-condition transfer case",
    };
  const comparisonFailure = [
    targetSpecificity.targetA,
    targetSpecificity.targetB,
  ].find(({ state }) => state !== "measured");
  if (comparisonFailure && comparisonFailure.state !== "measured")
    return {
      state: comparisonFailure.state,
      cause:
        "cause" in comparisonFailure
          ? comparisonFailure.cause
          : comparisonFailure.reason,
    };
  const constraints = [
    targetA.hardConstraintViolation,
    targetB.hardConstraintViolation,
  ];
  const constraintFailure = constraints.find(
    ({ state }) => state !== "measured",
  );
  if (constraintFailure && constraintFailure.state !== "measured")
    return {
      state: constraintFailure.state,
      cause:
        "cause" in constraintFailure
          ? constraintFailure.cause
          : constraintFailure.reason,
    };
  const targetATie =
    targetSpecificity.targetA.state === "measured" &&
    targetSpecificity.targetA.preference === "tie";
  const targetBTie =
    targetSpecificity.targetB.state === "measured" &&
    targetSpecificity.targetB.preference === "tie";
  const sharedConstraintCompliance = constraints.every(
    (result) => result.state === "measured" && result.detected === false,
  );
  return {
    state: "measured",
    converged: targetATie && targetBTie && sharedConstraintCompliance,
    targetATie,
    targetBTie,
    sharedConstraintCompliance,
  };
}

export async function evaluateCaseFamily(input: {
  readonly manifest: CaseManifest;
  readonly submissions: CaseFamilySubmissions;
  readonly transport: JudgeTransport;
  readonly protocol?: JudgeProtocol;
}): Promise<CaseFamilyEvaluation> {
  const manifest = parseCaseManifest(input.manifest);
  const protocol = input.protocol ?? DEFAULT_JUDGE_PROTOCOL;
  const conditions = [
    "unconditioned",
    "target_a",
    "target_b",
  ] as const satisfies readonly BenchmarkCondition[];
  const benchmarkInputs = Object.fromEntries(
    conditions.map((condition) => [
      condition,
      getBenchmarkInput(manifest, condition),
    ]),
  ) as Record<BenchmarkCondition, BenchmarkInput>;
  const evaluations: SubmissionEvaluation[] = [];
  for (const condition of conditions) {
    const submission = input.submissions[condition];
    evaluations.push(
      submission === undefined
        ? missingSubmissionEvaluation(benchmarkInputs[condition], protocol)
        : await evaluateSubmission({
            input: benchmarkInputs[condition],
            submission,
            transport: input.transport,
            protocol,
          }),
    );
  }
  const [unconditioned, targetA, targetB] = evaluations as [
    SubmissionEvaluation,
    SubmissionEvaluation,
    SubmissionEvaluation,
  ];
  const conditioningEffect = {
    targetA: await evaluatePairwise({
      comparison: "conditioning_effect_a",
      perspective: benchmarkInputs.target_a,
      first: targetA,
      second: unconditioned,
      transport: input.transport,
      protocol,
    }),
    targetB: await evaluatePairwise({
      comparison: "conditioning_effect_b",
      perspective: benchmarkInputs.target_b,
      first: targetB,
      second: unconditioned,
      transport: input.transport,
      protocol,
    }),
  };
  const targetSpecificity = {
    targetA: await evaluatePairwise({
      comparison: "target_specificity_a",
      perspective: benchmarkInputs.target_a,
      first: targetA,
      second: targetB,
      transport: input.transport,
      protocol,
    }),
    targetB: await evaluatePairwise({
      comparison: "target_specificity_b",
      perspective: benchmarkInputs.target_b,
      first: targetB,
      second: targetA,
      transport: input.transport,
      protocol,
    }),
  };
  return {
    caseId: manifest.caseId,
    submissionEvaluations: evaluations,
    conditioningEffect,
    targetSpecificity,
    boundaryConvergence: boundaryConvergence(
      manifest,
      targetSpecificity,
      targetA,
      targetB,
    ),
  };
}

export function isEvaluationDimension(
  value: string,
): value is EvaluationDimension {
  return EVALUATION_DIMENSIONS.includes(value as EvaluationDimension);
}
