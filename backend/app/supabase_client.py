from functools import lru_cache

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_admin_client() -> Client:
    """Server-side Supabase client using the secret key (bypasses RLS).

    Use only for trusted backend work (ICS imports, AI scheduling jobs, etc.).
    Always filter by the current user's id when reading or writing user data.
    """
    s = get_settings()
    if not s.supabase_url or not s.supabase_secret_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in backend/.env")
    return create_client(s.supabase_url, s.supabase_secret_key)


def get_current_user_id(
    authorization: str = Header(default=""),
    client: Client = Depends(get_admin_client),
) -> str:
    """FastAPI dependency: validates the Supabase access token the app sends
    as `Authorization: Bearer <token>` and returns the user's id."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        user = client.auth.get_user(token).user
    except Exception:
        user = None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return user.id
