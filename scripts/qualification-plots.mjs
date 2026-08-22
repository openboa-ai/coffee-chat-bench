import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const WIDTH = 1600;
const COLORS = [
  "#78a9ff",
  "#f6bd60",
  "#84d2a8",
  "#f28482",
  "#cdb4db",
  "#90dbf4",
  "#f7aef8",
  "#d8dee9",
];

function escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function metricValue(metricsDocument, path) {
  let value = metricsDocument?.metrics ?? metricsDocument;
  for (const key of path) value = value?.[key];
  return number(value?.value ?? value);
}

export function metricDomain(values, minLimit, maxLimit) {
  const measured = values.filter((value) => number(value) !== null);
  if (measured.length === 0) return [minLimit, maxLimit];
  const observedMin = Math.min(...measured);
  const observedMax = Math.max(...measured);
  const observedRange = observedMax - observedMin;
  const padding =
    observedRange > 0
      ? observedRange * 0.15
      : Math.max((maxLimit - minLimit) * 0.05, 0.05);
  const min = Math.max(minLimit, observedMin - padding);
  const max = Math.min(maxLimit, observedMax + padding);
  return min < max ? [min, max] : [minLimit, maxLimit];
}

export function plotSeries(values, min, max) {
  const safeMax = max === min ? min + 1 : max;
  const points = [];
  const segments = [];
  let segment = [];
  for (const [index, rawValue] of values.entries()) {
    const value = number(rawValue);
    if (value === null) {
      if (segment.length > 0) segments.push(segment);
      segment = [];
      continue;
    }
    const point = {
      index,
      value,
      normalized: Math.max(0, Math.min(1, (value - min) / (safeMax - min))),
    };
    points.push(point);
    segment.push(point);
  }
  if (segment.length > 0) segments.push(segment);
  return { points, segments };
}

function svgText(x, y, text, size = 20, fill = "#d8dee9", weight = 400) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-weight="${weight}">${escape(text)}</text>`;
}

function multiSeriesPanel(
  title,
  series,
  x,
  y,
  width,
  height,
  min,
  max,
  xLabels,
) {
  const left = x + 58;
  const top = y + 54;
  const innerWidth = width - 78;
  const innerHeight = height - 88;
  const allValues = series.flatMap((entry) => entry.values);
  const [axisMin, axisMax] = metricDomain(allValues, min, max);
  const toSvgPoint = ({ index, normalized }) => {
    const px =
      left +
      (xLabels.length <= 1
        ? innerWidth / 2
        : (index / (xLabels.length - 1)) * innerWidth);
    const py = top + innerHeight - normalized * innerHeight;
    return `${px},${py}`;
  };
  const lines = [];
  const dots = [];
  for (const [seriesIndex, entry] of series.entries()) {
    const plotted = plotSeries(entry.values, axisMin, axisMax);
    const color = COLORS[seriesIndex % COLORS.length];
    for (const segment of plotted.segments)
      lines.push(
        `<polyline fill="none" stroke="${color}" stroke-width="3" points="${segment.map(toSvgPoint).join(" ")}"/>`,
      );
    for (const point of plotted.points) {
      const [px, py] = toSvgPoint(point).split(",");
      dots.push(`<circle cx="${px}" cy="${py}" r="4" fill="${color}"/>`);
    }
  }
  const axisLabels = [axisMin, (axisMin + axisMax) / 2, axisMax]
    .map((value, index) =>
      svgText(
        x + 8,
        top + innerHeight - (index / 2) * innerHeight + 6,
        value.toFixed(2),
        13,
        "#8b98aa",
      ),
    )
    .join("");
  const stepLabels = xLabels
    .map((label, index) => {
      const labelX =
        left +
        (xLabels.length <= 1
          ? innerWidth / 2
          : (index / (xLabels.length - 1)) * innerWidth);
      return svgText(labelX - 8, top + innerHeight + 22, label, 12, "#8b98aa");
    })
    .join("");
  const legend = series
    .map((entry, index) => {
      const legendX = x + 180 + index * 78;
      const color = COLORS[index % COLORS.length];
      return `${svgText(legendX, y + 30, "●", 14, color, 700)}${svgText(legendX + 12, y + 30, entry.label, 12, "#b7c2d0")}`;
    })
    .join("");
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="#151b26" stroke="#2d3748"/>`,
    svgText(x + 18, y + 30, title, 18, "#f0f4fa", 600),
    legend,
    `<line x1="${left}" y1="${top + innerHeight}" x2="${left + innerWidth}" y2="${top + innerHeight}" stroke="#3b4657"/>`,
    `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + innerHeight}" stroke="#3b4657"/>`,
    axisLabels,
    stepLabels,
    lines.join(""),
    dots.join(""),
  ].join("");
}

function baseSvg(title, subtitle, height) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}">`,
    `<rect width="100%" height="100%" fill="#0c1118"/>`,
    svgText(44, 52, title, 30, "#ffffff", 700),
    svgText(44, 82, subtitle, 16, "#9aa8b8"),
  ];
}

async function writePng(svg, outputPath) {
  const temp = await mkdtemp(join("/tmp", "coffee-chat-bench-plot-"));
  const svgPath = join(temp, "plot.svg");
  await writeFile(svgPath, `${svg.join("\n")}</svg>`, "utf8");
  try {
    await execFileAsync("sips", [
      "-s",
      "format",
      "png",
      svgPath,
      "--out",
      outputPath,
    ]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

const ordinalSeries = [
  ["judgment", ["dimensions", "judgment_alignment"]],
  ["task", ["dimensions", "task_performance"]],
  ["evidence", ["dimensions", "evidence_grounding"]],
  [
    "cue use",
    ["dimensions", "stated_rationale_alignment", "facets", "cueUtilization"],
  ],
  [
    "cue weight",
    ["dimensions", "stated_rationale_alignment", "facets", "cueWeighting"],
  ],
  [
    "context",
    [
      "dimensions",
      "stated_rationale_alignment",
      "facets",
      "contextSensitivity",
    ],
  ],
  [
    "action",
    ["dimensions", "stated_rationale_alignment", "facets", "actionConsistency"],
  ],
];

function seriesFor(history, metric, source = ordinalSeries) {
  return source.map(([label, path]) => ({
    label,
    values: history.map((entry) =>
      metricValue(entry.metrics, [...path, metric]),
    ),
  }));
}

export async function writeQualificationPlots({
  stepDirectory,
  campaignDirectory,
  stepId,
  history,
  metrics,
  writeProgress = true,
}) {
  const metricSpecs = [
    ["QWK", "qwk", -1, 1],
    ["Spearman", "spearman", -1, 1],
    ["Pearson", "pearson", -1, 1],
    ["Exact agreement", "exactAgreement", 0, 1],
    ["Within one level", "withinOneLevelAccuracy", 0, 1],
    ["MAE", "mae", 0, 4],
    ["Signed bias", "signedBias", -4, 4],
    ["Coverage", "coverage", 0, 1],
    ["Invalid rate", "invalidRate", 0, 1],
    ["Unavailable rate", "unavailableRate", 0, 1],
    ["Abstained rate", "abstainedRate", 0, 1],
  ];
  const hardSpecs = [
    ["Hard recall", "criticalRecall", 0, 1],
    ["Hard precision", "criticalPrecision", 0, 1],
    ["Hard specificity", "criticalSpecificity", 0, 1],
    ["Hard MCC", "criticalMcc", -1, 1],
  ];
  const allSpecs = [
    ...metricSpecs.map((spec) => ({ spec, source: ordinalSeries })),
    ...hardSpecs.map((spec) => ({
      spec,
      source: [["hard", ["dimensions", "hard_constraint_violation"]]],
    })),
  ];
  const progressHeight = 120 + Math.ceil(allSpecs.length / 2) * 190 + 70;
  const progress = baseSvg(
    "Luna provisional Judge progress",
    `step ${stepId} · full calls: 624 · gaps are nonnumeric, not zero`,
    progressHeight,
  );
  const stepLabels = history.map((entry, index) =>
    entry.fullIterationNumber == null
      ? `S${index}`
      : `F${entry.fullIterationNumber}`,
  );
  for (const [index, { spec, source }] of allSpecs.entries()) {
    const [title, metric, min, max] = spec;
    const values = seriesFor(history, metric, source);
    progress.push(
      multiSeriesPanel(
        title,
        values,
        36 + (index % 2) * 776,
        120 + Math.floor(index / 2) * 190,
        744,
        165,
        min,
        max,
        stepLabels,
      ),
    );
  }
  progress.push(
    svgText(
      44,
      progressHeight - 25,
      `x-axis: full-matrix step order (${history.length} step${history.length === 1 ? "" : "s"})`,
      15,
      "#9aa8b8",
    ),
  );
  if (writeProgress)
    await writePng(progress, join(campaignDirectory, "progress.png"));

  const runHeight = 850;
  const run = baseSvg(
    "Luna provisional Judge run",
    `step ${stepId} · all seven ordinal measures plus hard-constraint detection`,
    runHeight,
  );
  const cardWidth = 210;
  const cardHeight = 350;
  const cardMetrics = [
    ["QWK", "qwk"],
    ["Exact", "exactAgreement"],
    ["MAE", "mae"],
    ["Abs bias", "absoluteSignedBias"],
    ["Coverage", "coverage"],
    ["Invalid", "invalidRate"],
    ["Unavailable", "unavailableRate"],
    ["Abstained", "abstainedRate"],
  ];
  for (const [index, [label, path]] of ordinalSeries.entries()) {
    const block =
      path.length === 2
        ? metrics.dimensions?.[path[1]]
        : metrics.dimensions?.stated_rationale_alignment?.facets?.[path.at(-1)];
    const x = 36 + index * 218;
    const y = 120;
    run.push(
      `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="14" fill="#151b26" stroke="#2d3748"/>`,
      svgText(x + 14, y + 30, label, 16, "#f0f4fa", 600),
    );
    for (const [rowIndex, [metricLabel, metricPath]] of cardMetrics.entries()) {
      const value =
        metricPath === "absoluteSignedBias"
          ? block?.signedBias?.value == null
            ? null
            : Math.abs(block.signedBias.value)
          : block?.[metricPath]?.value;
      const rowY = y + 66 + rowIndex * 33;
      run.push(
        svgText(x + 14, rowY, metricLabel, 13, "#9aa8b8"),
        svgText(
          x + 125,
          rowY,
          value == null ? "—" : value.toFixed(3),
          13,
          value == null ? "#e3a7a7" : "#d8dee9",
        ),
      );
    }
  }
  const hard = metrics.dimensions?.hard_constraint_violation;
  run.push(
    `<rect x="36" y="510" width="1528" height="230" rx="14" fill="#151b26" stroke="#2d3748"/>`,
    svgText(54, 544, "hard constraint", 19, "#f0f4fa", 600),
    svgText(
      54,
      584,
      `recall ${hard?.criticalRecall?.value == null ? "—" : hard.criticalRecall.value.toFixed(3)} · precision ${hard?.criticalPrecision?.value == null ? "—" : hard.criticalPrecision.value.toFixed(3)} · specificity ${hard?.criticalSpecificity?.value == null ? "—" : hard.criticalSpecificity.value.toFixed(3)} · MCC ${hard?.criticalMcc?.value == null ? "—" : hard.criticalMcc.value.toFixed(3)}`,
      17,
    ),
    svgText(
      54,
      624,
      `measured ${hard?.measured ?? 0}/${hard?.eligible ?? 0} · coverage ${hard?.coverage?.value == null ? "—" : hard.coverage.value.toFixed(3)} · invalid ${hard?.invalidRate?.value == null ? "—" : hard.invalidRate.value.toFixed(3)}`,
      17,
    ),
    svgText(
      54,
      684,
      `overall calls ${metrics.total ?? 0} · measured ${metrics.measured ?? 0} · output tokens ${metrics.meanOutputTokens?.value == null ? "—" : metrics.meanOutputTokens.value.toFixed(0)} · latency ${metrics.meanLatencyMs?.value == null ? "—" : metrics.meanLatencyMs.value.toFixed(0)} ms`,
      16,
      "#9aa8b8",
    ),
  );
  await writePng(run, join(stepDirectory, "run.png"));
}
