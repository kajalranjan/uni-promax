import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import Client, create_client

from app.config import get_settings
from app.supabase_client import get_admin_client

router = APIRouter(prefix="/auth", tags=["auth"])

# Same message for "no such username" and "wrong password", so nobody can use
# the login screen to find out which usernames exist.
LOGIN_ERROR = "Incorrect information entered, try again"

# Matches the rule in the database (profiles.username check constraint).
USERNAME_RE = re.compile(r"[A-Za-z0-9_.]{3,}")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str


def _public_client() -> Client:
    """A fresh client per login so sessions never leak between requests."""
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_publishable_key)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, admin: Client = Depends(get_admin_client)) -> LoginResponse:
    """Log in with username + password.

    Supabase Auth signs in by email, so we look up the email for the username
    (server-side only; emails are never sent back) and sign in with it. The app
    then hands the returned tokens to supabase.auth.setSession().
    """
    username = body.username.strip()
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, LOGIN_ERROR)

    # ilike = case-insensitive match; escape "_" so it isn't treated as a wildcard
    pattern = username.replace("_", r"\_")
    rows = (
        admin.table("profiles")
        .select("email")
        .ilike("username", pattern)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, LOGIN_ERROR)

    try:
        res = _public_client().auth.sign_in_with_password(
            {"email": rows[0]["email"], "password": body.password}
        )
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, LOGIN_ERROR)

    if res.session is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, LOGIN_ERROR)
    return LoginResponse(
        access_token=res.session.access_token,
        refresh_token=res.session.refresh_token,
    )
