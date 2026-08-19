import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const WIDTH = 1600;
const HEIGHT = 1100;

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

function metricValue(metrics, path) {
  let value = metrics;
  for (const key of path) value = value?.[key];
  return number(value?.value ?? value);
}

function svgText(x, y, text, size = 20, fill = "#d8dee9", weight = 400) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-weight="${weight}">${escape(text)}</text>`;
}

function panel(title, values, x, y, width, height, min = 0, max = 1) {
  const left = x + 52;
  const top = y + 50;
  const innerWidth = width - 72;
  const innerHeight = height - 82;
  const safeMax = max === min ? min + 1 : max;
  const points = values.map((value, index) => {
    const px =
      left +
      (values.length <= 1
        ? innerWidth / 2
        : (index / (values.length - 1)) * innerWidth);
    const py =
      top +
      innerHeight -
      (((value ?? min) - min) / (safeMax - min)) * innerHeight;
    return `${px},${py}`;
  });
  const line =
    points.length > 0
      ? `<polyline fill="none" stroke="#78a9ff" stroke-width="4" points="${points.join(" ")}"/>`
      : "";
  const dots = points
    .map((point) => {
      const [px, py] = point.split(",");
      return `<circle cx="${px}" cy="${py}" r="5" fill="#78a9ff"/>`;
    })
    .join("");
  const labels = [min, (min + safeMax) / 2, safeMax]
    .map((value, index) =>
      svgText(
        x + 8,
        top + innerHeight - (index / 2) * innerHeight + 6,
        value.toFixed(2),
        14,
        "#8b98aa",
      ),
    )
    .join("");
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="#151b26" stroke="#2d3748"/>`,
    svgText(x + 18, y + 30, title, 19, "#f0f4fa", 600),
    `<line x1="${left}" y1="${top + innerHeight}" x2="${left + innerWidth}" y2="${top + innerHeight}" stroke="#3b4657"/>`,
    `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + innerHeight}" stroke="#3b4657"/>`,
    labels,
    line,
    dots,
  ].join("");
}

function baseSvg(title, subtitle) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">`,
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

export async function writeQualificationPlots({
  stepDirectory,
  campaignDirectory,
  stepId,
  history,
  metrics,
}) {
  const dimensions = [
    "judgment_alignment",
    "task_performance",
    "evidence_grounding",
  ];
  const progress = baseSvg(
    "Luna provisional judge progress",
    `step ${stepId} · frozen qualification corpus · evidence state provisional`,
  );
  const metricSpecs = [
    ["QWK", ["macro", "qwk"], -1, 1],
    ["Adjacent-level accuracy", ["macro", "adjacentLevelAccuracy"], 0, 1],
    ["Pearson correlation", ["macro", "pearson"], -1, 1],
    ["MAE", ["macro", "mae"], 0, 4],
    ["Signed bias", ["macro", "signedBias"], -4, 4],
    ["Critical MCC", ["macro", "criticalMcc"], -1, 1],
    ["Coverage", ["coverage"], 0, 1],
    ["Invalid rate", ["invalidRate"], 0, 1],
  ];
  for (const [index, [title, path, min, max]] of metricSpecs.entries()) {
    const values = history.map((entry) => metricValue(entry.metrics, path));
    progress.push(
      panel(
        title,
        values,
        36 + (index % 2) * 776,
        120 + Math.floor(index / 2) * 220,
        744,
        190,
        min,
        max,
      ),
    );
  }
  progress.push(
    svgText(
      44,
      1050,
      `x-axis: completed step order (${history.length} step${history.length === 1 ? "" : "s"}) · gaps are unmeasured, not zero`,
      15,
      "#9aa8b8",
    ),
  );
  await writePng(progress, join(campaignDirectory, "progress.png"));

  const run = baseSvg(
    "Luna provisional judge run",
    `step ${stepId} · semantic dimensions and hard-constraint detection`,
  );
  for (const [index, dimension] of dimensions.entries()) {
    const block = metrics.dimensions?.[dimension];
    const values = [
      ["QWK", block?.qwk?.value],
      ["Adjacent", block?.adjacentLevelAccuracy?.value],
      ["Pearson", block?.pearson?.value],
      ["MAE", block?.mae?.value],
      ["Bias", block?.signedBias?.value],
      ["Exact", block?.exactAgreement?.value],
    ];
    const x = 36 + (index % 2) * 776;
    const y = 120 + Math.floor(index / 2) * 300;
    run.push(
      `<rect x="${x}" y="${y}" width="744" height="270" rx="14" fill="#151b26" stroke="#2d3748"/>`,
    );
    run.push(svgText(x + 18, y + 30, dimension, 19, "#f0f4fa", 600));
    for (const [metricIndex, [name, value]] of values.entries()) {
      const rowY = y + 64 + metricIndex * 31;
      const display = value == null ? "—" : value.toFixed(3);
      run.push(svgText(x + 24, rowY, name, 16, "#9aa8b8"));
      run.push(
        svgText(
          x + 205,
          rowY,
          display,
          16,
          value == null ? "#e3a7a7" : "#d8dee9",
        ),
      );
      if (value != null) {
        const normalized = Math.max(
          0,
          Math.min(
            1,
            (value + (name === "Pearson" || name === "Bias" ? 1 : 0)) /
              (name === "MAE" ? 4 : 2),
          ),
        );
        run.push(
          `<rect x="${x + 290}" y="${rowY - 15}" width="400" height="14" rx="7" fill="#263244"/><rect x="${x + 290}" y="${rowY - 15}" width="${400 * normalized}" height="14" rx="7" fill="#78a9ff"/>`,
        );
      }
    }
  }
  const hard = metrics.dimensions?.hard_constraint_violation;
  run.push(
    `<rect x="36" y="760" width="1528" height="220" rx="14" fill="#151b26" stroke="#2d3748"/>`,
  );
  run.push(svgText(54, 792, "hard_constraint_violation", 19, "#f0f4fa", 600));
  run.push(
    svgText(
      54,
      834,
      `recall ${hard?.criticalRecall?.value == null ? "—" : hard.criticalRecall.value.toFixed(3)} · MCC ${hard?.criticalMcc?.value == null ? "—" : hard.criticalMcc.value.toFixed(3)} · exact ${hard?.exactAgreement?.value == null ? "—" : hard.exactAgreement.value.toFixed(3)}`,
      18,
    ),
  );
  run.push(
    svgText(
      54,
      874,
      `measured ${hard?.measured ?? 0}/${hard?.eligible ?? 0} · invalid ${hard?.invalidRate?.value == null ? "—" : hard.invalidRate.value.toFixed(3)}`,
      18,
    ),
  );
  run.push(
    svgText(
      54,
      930,
      `overall coverage ${metrics.coverage?.value == null ? "—" : metrics.coverage.value.toFixed(3)} · invalid ${metrics.invalidRate?.value == null ? "—" : metrics.invalidRate.value.toFixed(3)} · output tokens ${metrics.meanOutputTokens?.value == null ? "—" : metrics.meanOutputTokens.value.toFixed(0)} · latency ${metrics.meanLatencyMs?.value == null ? "—" : metrics.meanLatencyMs.value.toFixed(0)} ms`,
      17,
      "#9aa8b8",
    ),
  );
  await writePng(run, join(stepDirectory, "run.png"));
}
