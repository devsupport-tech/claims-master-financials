const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

/**
 * Read claim rows through the Financials sidecar. The sidecar uses Supabase's
 * service role, while the browser remains limited by RLS.
 */
export async function getClaimRowsFromApi(): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${API_BASE_URL}/claims`, {
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Claims request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!Array.isArray(payload)) {
    throw new Error('Claims request returned an invalid response');
  }

  return payload as Array<Record<string, unknown>>;
}
