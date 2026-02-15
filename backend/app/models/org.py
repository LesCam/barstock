"""
Organization and Location Models
Multi-tenant hierarchy: Org -> Locations
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.core.database import Base


class Org(Base):
    """
    Organization model
    Top-level tenant in multi-tenant architecture
    """
    __tablename__ = "orgs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    locations = relationship("Location", back_populates="org", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Org(id={self.id}, name='{self.name}')>"


class Location(Base):
    """
    Location model
    Each location belongs to an org and has its own inventory/sessions
    """
    __tablename__ = "locations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=True)
    name = Column(String, nullable=False)
    timezone = Column(String, nullable=False, default="America/Montreal")
    closeout_hour = Column(Integer, nullable=False, default=4)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    org = relationship("Org", back_populates="locations")
    users = relationship("User", back_populates="location")
    user_locations = relationship("UserLocation", back_populates="location")
    inventory_items = relationship("InventoryItem", back_populates="location")
    keg_instances = relationship("KegInstance", back_populates="location")
    tap_lines = relationship("TapLine", back_populates="location")
    tap_assignments = relationship("TapAssignment", back_populates="location")
    pour_profiles = relationship("PourProfile", back_populates="location")
    pos_connections = relationship("POSConnection", back_populates="location")
    sales_lines = relationship("SalesLine", back_populates="location")
    pos_item_mappings = relationship("POSItemMapping", back_populates="location")
    consumption_events = relationship("ConsumptionEvent", back_populates="location")
    inventory_sessions = relationship("InventorySession", back_populates="location")
    bottle_templates = relationship("BottleTemplate", back_populates="location")
    bottle_measurements = relationship("BottleMeasurement", back_populates="location")
    
    def __repr__(self):
        return f"<Location(id={self.id}, name='{self.name}', org_id={self.org_id})>"
