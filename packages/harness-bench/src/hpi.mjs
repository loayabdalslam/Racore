import { round } from "./utils.mjs";

const DEFAULT_WEIGHTS = Object.freeze({
  quality: 0.60,
  reliability: 0.15,
  speed: 0.10,
  cost: 0.10,
  toolEfficiency: 0.05,
});

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function ratio(candidate, baseline, invert = false) {
  if (!finitePositive(candidate) || !finitePositive(baseline)) return null;
  const raw = invert ? baseline / candidate : candidate / baseline;
  return Math.min(4, Math.max(0.25, raw));
}

function weightedGeometricMean(parts) {
  const available = parts.filter((part) => part.ratio !== null && part.weight > 0);
  if (!available.length) return null;
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  const logMean = available.reduce((sum, part) => sum + (part.weight / totalWeight) * Math.log(part.ratio), 0);
  return Math.exp(logMean);
}

export function computeLocalHpi(candidate, baseline, weights = DEFAULT_WEIGHTS) {
  const parts = [
    { name: "quality", weight: weights.quality, ratio: ratio(candidate.passAt1, baseline.passAt1) },
    { name: "reliability", weight: weights.reliability, ratio: ratio(candidate.stablePassRate, baseline.stablePassRate) },
    { name: "speed", weight: weights.speed, ratio: ratio(candidate.durationMs?.median, baseline.durationMs?.median, true) },
    { name: "cost", weight: weights.cost, ratio: ratio(candidate.costMean, baseline.costMean, true) },
    { name: "toolEfficiency", weight: weights.toolEfficiency, ratio: ratio(candidate.toolCallsMean, baseline.toolCallsMean, true) },
  ];
  const combined = weightedGeometricMean(parts);
  return {
    hpi: combined === null ? null : round(combined * 100, 2),
    baseline: baseline.harness,
    candidate: candidate.harness,
    interpretation: "100 = baseline parity; >100 = harness lift; <100 = harness drag",
    components: Object.fromEntries(parts.map((part) => [part.name, part.ratio === null ? null : round(part.ratio * 100, 2)])),
  };
}

export function computePublicLiftIndex(evidence) {
  const ratios = evidence
    .map((row) => finitePositive(row.score) && finitePositive(row.baselineScore) ? row.score / row.baselineScore : null)
    .filter((value) => value !== null);
  if (!ratios.length) return { hpi: null, evidenceCount: 0, confidence: "N/A" };
  const geometric = Math.exp(ratios.reduce((sum, value) => sum + Math.log(value), 0) / ratios.length);
  const count = ratios.length;
  return {
    hpi: round(geometric * 100, 1),
    evidenceCount: count,
    confidence: count >= 4 ? "A" : count >= 2 ? "B" : "C",
  };
}

export function rankPublicHarnesses(registry) {
  return registry.harnesses
    .map((entry) => ({ ...entry, ...computePublicLiftIndex(entry.evidence ?? []) }))
    .sort((a, b) => {
      if (a.hpi === null && b.hpi === null) return a.name.localeCompare(b.name);
      if (a.hpi === null) return 1;
      if (b.hpi === null) return -1;
      return b.hpi - a.hpi;
    });
}

export { DEFAULT_WEIGHTS };
