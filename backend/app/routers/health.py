from fastapi import APIRouter

from app.supabase_client import get_admin_client

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Is the API running?"""
    return {"status": "ok"}


@router.get("/health/db")
def health_db() -> dict:
    """Can the API reach Supabase and read the schema?"""
    try:
        res = get_admin_client().table("interests").select("id", count="exact").limit(1).execute()
        return {"status": "ok", "interests": res.count}
    except Exception as e:  # surfaced so setup problems are easy to spot
        return {"status": "error", "detail": str(e)}
