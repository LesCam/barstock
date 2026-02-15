"""
User Models
Handles authentication, authorization, and multi-location access
"""

from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.core.database import Base


class RoleEnum(str, enum.Enum):
    """User role enumeration"""
    admin = "admin"
    manager = "manager"
    staff = "staff"


class User(Base):
    """
    User model
    Supports multi-location access via user_locations table
    """
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(SQLEnum(RoleEnum, name="role_t"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    location = relationship("Location", back_populates="users")
    user_locations = relationship("UserLocation", back_populates="user", cascade="all, delete-orphan")
    created_sessions = relationship(
        "InventorySession",
        back_populates="creator",
        foreign_keys="InventorySession.created_by"
    )
    closed_sessions = relationship(
        "InventorySession",
        back_populates="closer",
        foreign_keys="InventorySession.closed_by"
    )
    bottle_measurements = relationship("BottleMeasurement", back_populates="creator")
    
    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"
    
    def has_location_access(self, location_id: uuid.UUID) -> bool:
        """Check if user has access to a specific location"""
        return any(ul.location_id == location_id for ul in self.user_locations)
    
    def get_location_role(self, location_id: uuid.UUID) -> RoleEnum:
        """Get user's role for a specific location"""
        for ul in self.user_locations:
            if ul.location_id == location_id:
                return ul.role
        return None


class UserLocation(Base):
    """
    User-Location mapping with role
    Allows users to have different roles at different locations
    """
    __tablename__ = "user_locations"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), primary_key=True)
    role = Column(SQLEnum(RoleEnum, name="role_t"), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="user_locations")
    location = relationship("Location", back_populates="user_locations")
    
    def __repr__(self):
        return f"<UserLocation(user_id={self.user_id}, location_id={self.location_id}, role='{self.role}')>"
