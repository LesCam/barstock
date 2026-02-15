"""
Inventory Session Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid


class InventorySessionBase(BaseModel):
    """Base inventory session schema"""
    session_type: str  # shift, daily, weekly, monthly
    started_ts: datetime


class InventorySessionCreate(InventorySessionBase):
    """Create inventory session request"""
    location_id: uuid.UUID


class InventorySessionUpdate(BaseModel):
    """Update inventory session request"""
    ended_ts: Optional[datetime] = None


class InventorySessionResponse(InventorySessionBase):
    """Inventory session response"""
    id: uuid.UUID
    location_id: uuid.UUID
    ended_ts: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None
    closed_by: Optional[uuid.UUID] = None
    created_at: datetime
    is_closed: bool = False
    
    class Config:
        from_attributes = True


class SessionLineBase(BaseModel):
    """Base session line schema"""
    inventory_item_id: uuid.UUID
    count_units: Optional[float] = None
    tap_line_id: Optional[uuid.UUID] = None
    keg_instance_id: Optional[uuid.UUID] = None
    percent_remaining: Optional[float] = Field(None, ge=0, le=100)
    gross_weight_grams: Optional[float] = Field(None, ge=0)
    is_manual: bool = False
    notes: Optional[str] = None


class SessionLineCreate(SessionLineBase):
    """Create session line request"""
    session_id: uuid.UUID


class SessionLineResponse(SessionLineBase):
    """Session line response"""
    id: uuid.UUID
    session_id: uuid.UUID
    derived_ml: Optional[float] = None
    derived_oz: Optional[float] = None
    confidence_level: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class SessionCloseRequest(BaseModel):
    """Close session request"""
    variance_reasons: Optional[List[dict]] = None  # [{item_id, reason, notes}]


class SessionCloseResponse(BaseModel):
    """Close session response"""
    session_id: uuid.UUID
    adjustments_created: int
    total_variance: float
    requires_reasons: List[uuid.UUID] = []  # Items needing variance reasons
