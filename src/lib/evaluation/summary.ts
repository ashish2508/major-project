import { evaluatePan, overlaps, type PanMetrics } from './pan';
import type { PlagiarismAnnotation } from '../dataset/types';
import type { Detection } from '../detection/detector';

export interface QueryFalsePositiveRate {
  cleanQueries: number;
  cleanQueriesWithAlerts: number;
  rate: number;
}

/** Document-level FPR: fraction of ground-truth-clean query documents with >=1 alert. */
export function queryFalsePositiveRate(
  cleanQueries: number,
  cleanQueriesWithAlerts: number,
): QueryFalsePositiveRate {
  if (
    !Number.isSafeInteger(cleanQueries) ||
    cleanQueries < 0 ||
    !Number.isSafeInteger(cleanQueriesWithAlerts) ||
    cleanQueriesWithAlerts < 0 ||
    cleanQueriesWithAlerts > cleanQueries
  )
    throw new Error('Invalid clean-query counts');
  return {
    cleanQueries,
    cleanQueriesWithAlerts,
    rate: cleanQueries === 0 ? 0 : cleanQueriesWithAlerts / cleanQueries,
  };
}

export function formatRate(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function metricsAreFinite(metrics: PanMetrics): boolean {
  return [
    metrics.precision,
    metrics.recall,
    metrics.f1,
    metrics.granularity,
    metrics.plagdet,
  ].every(Number.isFinite);
}

export function evaluatePredictions(
  suspiciousReferences: string[],
  cases: PlagiarismAnnotation[],
  predictions: Detection[],
) {
  const positiveReferences = new Set(cases.map((item) => item.suspiciousReference));
  const cleanReferences = suspiciousReferences.filter((ref) => !positiveReferences.has(ref));
  const alertReferences = new Set(
    predictions
      .filter((item) => cleanReferences.includes(item.suspiciousReference))
      .map((item) => item.suspiciousReference),
  );
  const falsePositiveRate = queryFalsePositiveRate(cleanReferences.length, alertReferences.size);
  const unmatched = predictions.filter(
    (prediction) => !cases.some((item) => overlaps(item, prediction)),
  );
  return {
    metrics: evaluatePan(cases, predictions),
    falsePositiveRate,
    unmatched,
    missedAnnotationIds: cases
      .filter((item) => !predictions.some((prediction) => overlaps(item, prediction)))
      .map((item) => item.id),
  };
}
