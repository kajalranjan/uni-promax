// Small helper for calling our FastAPI backend.
// On a physical phone, "localhost" means the phone itself — set
// EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.1.20:8000
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function apiGet<T>(path: string, accessToken?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
