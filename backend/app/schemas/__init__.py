"""
Schemas Package
Pydantic models for request/response validation
"""

from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    UserCreate,
    UserUpdate,
    UserResponse,
    CurrentUserResponse,
    UserLocationCreate,
    UserLocationResponse,
)

from app.schemas.org import (
    OrgCreate,
    OrgUpdate,
    OrgResponse,
    LocationCreate,
    LocationUpdate,
    LocationResponse,
    LocationWithStats,
)

from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemUpdate,
    InventoryItemResponse,
    PriceHistoryCreate,
    PriceHistoryResponse,
    OnHandResponse,
)

from app.schemas.pos import (
    POSConnectionCreate,
    POSConnectionUpdate,
    POSConnectionResponse,
    SalesLineCreate,
    SalesLineResponse,
    UnmappedItemResponse,
    POSItemMappingCreate,
    POSItemMappingUpdate,
    POSItemMappingResponse,
    ImportRequest,
    ImportResponse,
    DepletionRequest,
    DepletionResponse,
)

from app.schemas.session import (
    InventorySessionCreate,
    InventorySessionUpdate,
    InventorySessionResponse,
    SessionLineCreate,
    SessionLineResponse,
    SessionCloseRequest,
    SessionCloseResponse,
)

from app.schemas.reports import (
    VarianceItemResponse,
    VarianceReportResponse,
    OnHandReportResponse,
    UsageReportResponse,
    ValuationReportResponse,
    OrgRollupReportResponse,
)

__all__ = [
    # Auth
    "LoginRequest",
    "TokenResponse",
    "RefreshTokenRequest",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "CurrentUserResponse",
    "UserLocationCreate",
    "UserLocationResponse",
    
    # Org & Locations
    "OrgCreate",
    "OrgUpdate",
    "OrgResponse",
    "LocationCreate",
    "LocationUpdate",
    "LocationResponse",
    "LocationWithStats",
    
    # Inventory
    "InventoryItemCreate",
    "InventoryItemUpdate",
    "InventoryItemResponse",
    "PriceHistoryCreate",
    "PriceHistoryResponse",
    "OnHandResponse",
    
    # POS
    "POSConnectionCreate",
    "POSConnectionUpdate",
    "POSConnectionResponse",
    "SalesLineCreate",
    "SalesLineResponse",
    "UnmappedItemResponse",
    "POSItemMappingCreate",
    "POSItemMappingUpdate",
    "POSItemMappingResponse",
    "ImportRequest",
    "ImportResponse",
    "DepletionRequest",
    "DepletionResponse",
    
    # Sessions
    "InventorySessionCreate",
    "InventorySessionUpdate",
    "InventorySessionResponse",
    "SessionLineCreate",
    "SessionLineResponse",
    "SessionCloseRequest",
    "SessionCloseResponse",
    
    # Reports
    "VarianceItemResponse",
    "VarianceReportResponse",
    "OnHandReportResponse",
    "UsageReportResponse",
    "ValuationReportResponse",
    "OrgRollupReportResponse",
]
