/** Thin client for the TraceFlow backend. */

import type { ExplainResponse, Step, TraceResponse } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** Send source code to the backend and return the execution trace. */
export async function trace(
  code: string,
  language = "java",
): Promise<TraceResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, language }),
    });
  } catch {
    throw new ApiError(
      `Could not reach the TraceFlow backend. Is it running on ${API_BASE}?`,
      0,
    );
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(detail, res.status);
  }

  return (await res.json()) as TraceResponse;
}

/** Ask the backend to explain a trace step, or answer a question about it. */
export async function explain(
  code: string,
  step: Step,
  prevStep: Step | null,
  question?: string,
): Promise<ExplainResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, step, prevStep, question: question ?? null }),
    });
  } catch {
    throw new ApiError(`Could not reach the TraceFlow backend at ${API_BASE}.`, 0);
  }
  if (!res.ok) {
    throw new ApiError(`Explain request failed (${res.status}).`, res.status);
  }
  return (await res.json()) as ExplainResponse;
}
