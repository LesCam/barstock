"""
API v1 Router
Aggregates all v1 endpoints
"""

from fastapi import APIRouter

from app.api.v1 import auth, orgs

api_router = APIRouter()

# Include route modules
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(orgs.router, prefix="/orgs", tags=["Organizations"])

# TODO: Add remaining routers as they're created:
# from app.api.v1 import inventory, pos, sessions, reports
# api_router.include_router(inventory.router, prefix="/inventory", tags=["Inventory"])
# api_router.include_router(pos.router, prefix="/pos", tags=["POS"])
# api_router.include_router(sessions.router, prefix="/sessions", tags=["Sessions"])
# api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])

@api_router.get("/")
def api_root():
    return {
        "message": "BarStock API v1",
        "version": "1.1.0",
        "status": "active",
        "endpoints": {
            "auth": "/v1/auth",
            "orgs": "/v1/orgs",
            "docs": "/docs"
        }
    }
