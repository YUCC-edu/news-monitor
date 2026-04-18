/** Parse JSON from fetch Response; surfaces empty/HTML bodies instead of opaque json() errors. */
export async function readJsonResponse<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}: ${text.trim() || "(empty body)"}`);
  }
  if (!text.trim()) {
    throw new Error(`${label} returned empty body (expected JSON)`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`${label} is not valid JSON: ${preview}`);
  }
}
