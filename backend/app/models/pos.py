"""
POS Integration Models
Handles POS connections, canonical sales lines, and item mappings
"""

from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Text, Date, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, date
import uuid
import enum

from app.core.database import Base


class SourceSystem(str, enum.Enum):
    """POS source system enumeration"""
    toast = "toast"
    square = "square"
    lightspeed = "lightspeed"
    clover = "clover"
    other = "other"
    manual = "manual"


class MappingMode(str, enum.Enum):
    """POS item mapping mode enumeration"""
    packaged_unit = "packaged_unit"
    draft_by_tap = "draft_by_tap"
    draft_by_product = "draft_by_product"


class POSConnection(Base):
    """
    POS Connection model
    Stores connection configuration for POS integrations
    """
    __tablename__ = "pos_connections"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    source_system = Column(SQLEnum(SourceSystem, name="source_system_t"), nullable=False)
    method = Column(String, nullable=False)  # api, sftp_export, webhook, manual_upload
    status = Column(String, nullable=False, default="active")
    last_success_ts = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    location = relationship("Location", back_populates="pos_connections")
    
    def __repr__(self):
        return f"<POSConnection(id={self.id}, system='{self.source_system}', status='{self.status}')>"


class SalesLine(Base):
    """
    Sales Line model - CANONICAL POS DATA
    
    This is the POS-agnostic representation of sales data.
    All POS adapters transform to this format.
    Depletion engine ONLY consumes this table - never touches POS-specific data.
    """
    __tablename__ = "sales_lines"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_system = Column(SQLEnum(SourceSystem, name="source_system_t"), nullable=False)
    source_location_id = Column(String, nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False, index=True)
    business_date = Column(Date, nullable=False, index=True)
    sold_at = Column(DateTime, nullable=False, index=True)
    receipt_id = Column(String, nullable=False)
    line_id = Column(String, nullable=False)
    pos_item_id = Column(String, nullable=False)
    pos_item_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    is_voided = Column(Boolean, nullable=False, default=False)
    is_refunded = Column(Boolean, nullable=False, default=False)
    size_modifier_id = Column(String, nullable=True)
    size_modifier_name = Column(String, nullable=True)
    raw_payload_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    __table_args__ = (
        UniqueConstraint(
            'source_system',
            'source_location_id',
            'business_date',
            'receipt_id',
            'line_id',
            'size_modifier_id',
            name='uq_salesline_idempotency'
        ),
    )
    
    # Relationships
    location = relationship("Location", back_populates="sales_lines")
    consumption_events = relationship("ConsumptionEvent", back_populates="sales_line")
    
    def __repr__(self):
        return f"<SalesLine(id={self.id}, pos_item='{self.pos_item_name}', qty={self.quantity}, sold={self.sold_at})>"
    
    def is_depleted(self) -> bool:
        """Check if this sales line has been depleted to inventory"""
        return len(self.consumption_events) > 0


class POSItemMapping(Base):
    """
    POS Item Mapping model
    Maps POS items to inventory items with versioned effective dates
    
    Supports multiple mapping modes:
    - packaged_unit: Direct unit depletion
    - draft_by_tap: Depletion to specific tap line
    - draft_by_product: Depletion to any active keg of product (not recommended)
    """
    __tablename__ = "pos_item_mappings"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False, index=True)
    source_system = Column(SQLEnum(SourceSystem, name="source_system_t"), nullable=False)
    pos_item_id = Column(String, nullable=False, index=True)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False)
    mode = Column(SQLEnum(MappingMode, name="mapping_mode_t"), nullable=False)
    pour_profile_id = Column(UUID(as_uuid=True), ForeignKey("pour_profiles.id"), nullable=True)
    tap_line_id = Column(UUID(as_uuid=True), ForeignKey("tap_lines.id"), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    effective_from_ts = Column(DateTime, nullable=False, index=True)
    effective_to_ts = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    location = relationship("Location", back_populates="pos_item_mappings")
    inventory_item = relationship("InventoryItem", back_populates="pos_item_mappings")
    pour_profile = relationship("PourProfile", back_populates="pos_item_mappings")
    tap_line = relationship("TapLine", back_populates="pos_item_mappings")
    
    def __repr__(self):
        return f"<POSItemMapping(pos_item='{self.pos_item_id}', inventory={self.inventory_item_id}, mode='{self.mode}')>"
    
    def is_effective(self, as_of_date: datetime = None) -> bool:
        """Check if mapping is effective at a specific time"""
        if as_of_date is None:
            as_of_date = datetime.utcnow()
        
        if not self.active:
            return False
        
        if self.effective_from_ts > as_of_date:
            return False
        
        if self.effective_to_ts is not None and self.effective_to_ts <= as_of_date:
            return False
        
        return True
