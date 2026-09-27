// Small helpers for calling our FastAPI backend.
// On a physical phone, "localhost" means the phone itself — set
// EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.1.20:8000
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit, accessToken?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI puts error messages in "detail"
    const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }
  return body as T;
}

export function apiGet<T>(path: string, accessToken?: string): Promise<T> {
  return request<T>(path, { method: 'GET' }, accessToken);
}

export function apiPost<T>(path: string, data: unknown, accessToken?: string): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(data) }, accessToken);
}
