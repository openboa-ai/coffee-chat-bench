export function campaignIsCompatible(campaign, expected) {
  return (
    campaign?.measurementPlanDigest === expected.measurementPlanDigest &&
    campaign?.gatePolicyId === expected.gatePolicyId &&
    campaign?.gatePolicyDigest === expected.gatePolicyDigest
  );
}

export function metricsBelongToCampaign(metrics, expected) {
  return campaignIsCompatible(metrics, expected);
}
