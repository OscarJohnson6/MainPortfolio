import { mockAnalyze } from './mock/engine';
import type { AnalyzeRequest, AnalyzeResponse } from './types';

/**
 * Where the Python backend lives, e.g. "https://api.oscarjohnson.dev/api/explain".
 * Leave unset to run fully on the in-browser mock engine.
 */
const API_URL = process.env.NEXT_PUBLIC_EXPLAIN_API_URL;

export async function analyze(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  if (!API_URL) return mockAnalyze(req);
  try {
    const res = await fetch(`${API_URL.replace(/\/$/, '')}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    return (await res.json()) as AnalyzeResponse;
  } catch (err) {
    if (signal?.aborted) throw err;
    const fallback = await mockAnalyze(req);
    fallback.notices.unshift('The Python backend could not be reached, so these results come from the in-browser mock engine.');
    return fallback;
  }
}
