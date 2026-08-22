import { EVALUATION_DIMENSIONS } from "../src/judge-protocol.ts";
import { stableDigest } from "../src/contracts.ts";

const DIMENSIONS = Object.freeze([...EVALUATION_DIMENSIONS]);

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function validateProtocol(value, label, dimension) {
  const protocol = record(value, label);
  nonEmptyString(protocol.protocolId, `${label}.protocolId`);
  nonEmptyString(protocol.preamble, `${label}.preamble`);
  nonEmptyString(protocol.pairwiseInstruction, `${label}.pairwiseInstruction`);
  const definitions = record(protocol.dimensions, `${label}.dimensions`);
  for (const requiredDimension of DIMENSIONS) {
    const definition = record(
      definitions[requiredDimension],
      `${label}.dimensions.${requiredDimension}`,
    );
    nonEmptyString(
      definition.instruction,
      `${label}.dimensions.${requiredDimension}.instruction`,
    );
    nonEmptyString(
      definition.anchors,
      `${label}.dimensions.${requiredDimension}.anchors`,
    );
  }
  if (!definitions[dimension])
    throw new TypeError(`${label} does not define ${dimension}`);
  return protocol;
}

function promptSemantic(artifactType, mode, bundleId, promptDigests) {
  return { artifactType, mode, bundleId, promptDigests };
}

function canonicalDocument(
  mode,
  bundleId,
  protocolsByDimension,
  promptDigests,
) {
  const protocols = Object.fromEntries(
    DIMENSIONS.map((dimension) => [
      dimension,
      {
        protocol: protocolsByDimension[dimension],
        promptDigest: promptDigests[dimension],
      },
    ]),
  );
  const artifactType = "judge_prompt_bundle";
  const bundleDigest = stableDigest(
    promptSemantic(artifactType, mode, bundleId, promptDigests),
  );
  return {
    artifact_type: artifactType,
    mode,
    bundleId,
    protocols,
    bundleDigest,
  };
}

function normalizeSingleProtocol(document) {
  const source = record(document, "prompt document");
  const protocol = source.protocol ?? source;
  const protocolsByDimension = Object.fromEntries(
    DIMENSIONS.map((dimension) => [
      dimension,
      validateProtocol(protocol, "prompt.protocol", dimension),
    ]),
  );
  const promptDigests = Object.fromEntries(
    DIMENSIONS.map((dimension) => [
      dimension,
      stableDigest(protocolsByDimension[dimension]),
    ]),
  );
  const mode = "single_protocol";
  const bundleId = "legacy-single-protocol";
  return {
    mode,
    bundleId,
    protocolsByDimension,
    promptDigests,
    bundleDigest: stableDigest(
      promptSemantic("judge_prompt_bundle", mode, bundleId, promptDigests),
    ),
    document: canonicalDocument(
      mode,
      bundleId,
      protocolsByDimension,
      promptDigests,
    ),
  };
}

function normalizeBundle(document) {
  const source = record(document, "prompt bundle");
  if (source.artifact_type !== "judge_prompt_bundle")
    throw new TypeError(
      "prompt bundle artifact_type must be judge_prompt_bundle",
    );
  const bundleId = nonEmptyString(source.bundleId, "prompt bundle.bundleId");
  const sourceProtocols = record(source.protocols, "prompt bundle.protocols");
  const sourceKeys = Object.keys(sourceProtocols).sort();
  const expectedKeys = [...DIMENSIONS].sort();
  if (JSON.stringify(sourceKeys) !== JSON.stringify(expectedKeys))
    throw new TypeError(
      `prompt bundle.protocols must contain exactly ${expectedKeys.join(", ")}`,
    );
  const mode = source.mode ?? "independent_lanes";
  if (mode !== "independent_lanes")
    throw new TypeError(
      "prompt bundle.mode must be independent_lanes for bundled prompts",
    );
  const protocolsByDimension = {};
  const promptDigests = {};
  for (const dimension of DIMENSIONS) {
    const entry = record(
      sourceProtocols[dimension],
      `prompt bundle.protocols.${dimension}`,
    );
    const protocol = validateProtocol(
      entry.protocol ?? entry,
      `prompt bundle.protocols.${dimension}.protocol`,
      dimension,
    );
    const promptDigest = stableDigest(protocol);
    if (entry.promptDigest !== undefined && entry.promptDigest !== promptDigest)
      throw new TypeError(
        `prompt bundle.protocols.${dimension}.promptDigest does not match protocol`,
      );
    protocolsByDimension[dimension] = protocol;
    promptDigests[dimension] = promptDigest;
  }
  const expectedBundleDigest = stableDigest(
    promptSemantic("judge_prompt_bundle", mode, bundleId, promptDigests),
  );
  if (
    source.bundleDigest !== undefined &&
    source.bundleDigest !== expectedBundleDigest
  )
    throw new TypeError("prompt bundle.bundleDigest does not match content");
  return {
    mode,
    bundleId,
    protocolsByDimension,
    promptDigests,
    bundleDigest: expectedBundleDigest,
    document: canonicalDocument(
      mode,
      bundleId,
      protocolsByDimension,
      promptDigests,
    ),
  };
}

/**
 * Normalize the injected prompt source into independent lane protocols.
 * Legacy single-protocol files remain readable, but new hill-climbing steps
 * should use the independent_lanes bundle so each dimension receives only
 * its own protocol in its own Judge request.
 */
export function normalizeJudgePromptDocument(document) {
  const source = record(document, "prompt document");
  if (source.artifact_type === "judge_prompt_bundle")
    return normalizeBundle(source);
  return normalizeSingleProtocol(source);
}

export { DIMENSIONS as JUDGE_PROMPT_DIMENSIONS };
