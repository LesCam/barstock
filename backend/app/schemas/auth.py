"""
Authentication Schemas
Request/response models for auth endpoints
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, List
from datetime import datetime
import uuid


class LoginRequest(BaseModel):
    """Login request"""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshTokenRequest(BaseModel):
    """Refresh token request"""
    refresh_token: str


class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    role: str  # admin, manager, staff


class UserCreate(UserBase):
    """Create user request"""
    password: str
    location_id: uuid.UUID


class UserUpdate(BaseModel):
    """Update user request"""
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    """User response"""
    id: uuid.UUID
    location_id: uuid.UUID
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class CurrentUserResponse(UserResponse):
    """Current authenticated user with permissions"""
    location_ids: List[uuid.UUID]  # All accessible locations
    roles: Dict[str, str]  # location_id -> role mapping
    org_id: Optional[uuid.UUID] = None


class UserLocationCreate(BaseModel):
    """Grant user access to a location"""
    user_id: uuid.UUID
    location_id: uuid.UUID
    role: str  # admin, manager, staff


class UserLocationResponse(BaseModel):
    """User-location mapping"""
    user_id: uuid.UUID
    location_id: uuid.UUID
    role: str
    
    class Config:
        from_attributes = True
