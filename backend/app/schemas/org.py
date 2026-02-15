"""
Organization and Location Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid


class OrgBase(BaseModel):
    """Base org schema"""
    name: str = Field(..., min_length=1, max_length=255)


class OrgCreate(OrgBase):
    """Create organization request"""
    pass


class OrgUpdate(BaseModel):
    """Update organization request"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class OrgResponse(OrgBase):
    """Organization response"""
    id: uuid.UUID
    created_at: datetime
    
    class Config:
        from_attributes = True


class LocationBase(BaseModel):
    """Base location schema"""
    name: str = Field(..., min_length=1, max_length=255)
    timezone: str = Field(default="America/Montreal")
    closeout_hour: int = Field(default=4, ge=0, le=23)


class LocationCreate(LocationBase):
    """Create location request"""
    org_id: Optional[uuid.UUID] = None


class LocationUpdate(BaseModel):
    """Update location request"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    timezone: Optional[str] = None
    closeout_hour: Optional[int] = Field(None, ge=0, le=23)


class LocationResponse(LocationBase):
    """Location response"""
    id: uuid.UUID
    org_id: Optional[uuid.UUID]
    created_at: datetime
    
    class Config:
        from_attributes = True


class LocationWithStats(LocationResponse):
    """Location with additional stats (for org dashboard)"""
    last_pos_import: Optional[datetime] = None
    unmapped_count: int = 0
    open_sessions: int = 0
    top_variance_7d: Optional[float] = None
