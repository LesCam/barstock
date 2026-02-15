"""
POS Integration Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, date
import uuid


class POSConnectionBase(BaseModel):
    """Base POS connection schema"""
    source_system: str  # toast, square, lightspeed, etc.
    method: str  # api, sftp_export, webhook, manual_upload
    status: str = Field(default="active")


class POSConnectionCreate(POSConnectionBase):
    """Create POS connection request"""
    location_id: uuid.UUID


class POSConnectionUpdate(BaseModel):
    """Update POS connection request"""
    status: Optional[str] = None
    last_error: Optional[str] = None


class POSConnectionResponse(POSConnectionBase):
    """POS connection response"""
    id: uuid.UUID
    location_id: uuid.UUID
    last_success_ts: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class SalesLineBase(BaseModel):
    """Base sales line schema (canonical)"""
    source_system: str
    source_location_id: str
    business_date: date
    sold_at: datetime
    receipt_id: str
    line_id: str
    pos_item_id: str
    pos_item_name: str
    quantity: float
    is_voided: bool = False
    is_refunded: bool = False
    size_modifier_id: Optional[str] = None
    size_modifier_name: Optional[str] = None


class SalesLineCreate(SalesLineBase):
    """Create sales line request"""
    location_id: uuid.UUID
    raw_payload_json: Optional[Dict[str, Any]] = None


class SalesLineResponse(SalesLineBase):
    """Sales line response"""
    id: uuid.UUID
    location_id: uuid.UUID
    created_at: datetime
    is_depleted: bool = False  # Computed field
    
    class Config:
        from_attributes = True


class UnmappedItemResponse(BaseModel):
    """Unmapped POS item response"""
    pos_item_id: str
    pos_item_name: str
    source_system: str
    qty_sold_7d: float
    first_seen: datetime
    last_seen: datetime


class POSItemMappingBase(BaseModel):
    """Base POS item mapping schema"""
    source_system: str
    pos_item_id: str
    mode: str  # packaged_unit, draft_by_tap, draft_by_product
    pour_profile_id: Optional[uuid.UUID] = None
    tap_line_id: Optional[uuid.UUID] = None
    effective_from_ts: datetime


class POSItemMappingCreate(POSItemMappingBase):
    """Create POS item mapping request"""
    location_id: uuid.UUID
    inventory_item_id: uuid.UUID
    effective_to_ts: Optional[datetime] = None


class POSItemMappingUpdate(BaseModel):
    """Update POS item mapping request"""
    active: Optional[bool] = None
    effective_to_ts: Optional[datetime] = None


class POSItemMappingResponse(POSItemMappingBase):
    """POS item mapping response"""
    id: uuid.UUID
    location_id: uuid.UUID
    inventory_item_id: uuid.UUID
    active: bool
    effective_to_ts: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class ImportRequest(BaseModel):
    """Trigger POS import request"""
    location_id: uuid.UUID
    from_date: Optional[date] = None
    to_date: Optional[date] = None


class ImportResponse(BaseModel):
    """Import job response"""
    job_id: str
    status: str
    message: str


class DepletionRequest(BaseModel):
    """Trigger depletion processing request"""
    location_id: uuid.UUID
    from_ts: datetime
    to_ts: datetime


class DepletionResponse(BaseModel):
    """Depletion processing response"""
    processed_sales_lines: int
    created_events: int
    unmapped: int
