import test from "node:test";
import assert from "node:assert/strict";

import * as plots from "../scripts/qualification-plots.mjs";

test("progress metrics are read from the persisted metrics document", () => {
  assert.equal(typeof plots.metricValue, "function");
  assert.equal(
    plots.metricValue({ metrics: { macro: { qwk: { value: 0.397 } } } }, [
      "macro",
      "qwk",
    ]),
    0.397,
  );
  assert.equal(
    plots.metricValue({ metrics: { macro: { spearman: { value: null } } } }, [
      "macro",
      "spearman",
    ]),
    null,
  );
});

test("progress plotting keeps missing observations as gaps", () => {
  assert.equal(typeof plots.plotSeries, "function");
  const series = plots.plotSeries([0.2, null, 0.4], 0, 1);
  assert.equal(series.points.length, 2);
  assert.equal(series.segments.length, 2);
  assert.deepEqual(
    series.segments.map((segment) => segment.length),
    [1, 1],
  );
});

test("each metric receives a data-aware axis within its semantic bounds", () => {
  assert.equal(typeof plots.metricDomain, "function");
  const [min, max] = plots.metricDomain([0.329, 0.397, 0.394], -1, 1);
  assert.ok(min > -1);
  assert.ok(max < 1);
  assert.ok(min < 0.329);
  assert.ok(max > 0.397);
});
