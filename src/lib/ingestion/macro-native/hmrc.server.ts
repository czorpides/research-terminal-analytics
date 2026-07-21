/**
 * HMRC monthly tax-receipts client. HMRC publishes its bulletin as CSV
 * on GOV.UK with no first-party JSON API, so we use the ONS-hosted
 * timeseries mirror (dataset "hmrc-tax-and-nics-receipts") — same
 * upstream data, ONS-shaped JSON.
 */
import type { NativeObs } from "./types";
import { fetchOnsSeries } from "./ons.server";

export async function fetchHmrcSeries(seriesCode: string): Promise<NativeObs[]> {
  return fetchOnsSeries(seriesCode);
}