"""
Draft Beer Models
Handles keg lifecycle, tap lines, and tap assignments
"""
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.core.database import Base


class KegStatus(str, enum.Enum):
    """Keg status enumeration"""
    in_storage = "in_storage"
    in_service = "in_service"
    empty = "empty"
    returned = "returned"


class KegSize(Base):
    """
    Keg Size model
    Standard keg sizes (½ bbl, ¼ bbl, 50L, etc.)
    """
    __tablename__ = "keg_sizes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    total_oz = Column(Float, nullable=False)
    
    # Relationships
    keg_instances = relationship("KegInstance", back_populates="keg_size")
    
    def __repr__(self):
        return f"<KegSize(id={self.id}, name='{self.name}', oz={self.total_oz})>"


class KegInstance(Base):
    """
    Keg Instance model
    Tracks individual kegs through their lifecycle
    """
    __tablename__ = "keg_instances"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False, index=True)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False, index=True)
    keg_size_id = Column(UUID(as_uuid=True), ForeignKey("keg_sizes.id"), nullable=False)
    status = Column(SQLEnum(KegStatus, name="keg_status_t"), nullable=False, default=KegStatus.in_storage)
    received_ts = Column(DateTime, nullable=False)
    tapped_ts = Column(DateTime, nullable=True)
    emptied_ts = Column(DateTime, nullable=True)
    starting_oz = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    location = relationship("Location", back_populates="keg_instances")
    inventory_item = relationship("InventoryItem", back_populates="keg_instances")
    keg_size = relationship("KegSize", back_populates="keg_instances")
    tap_assignments = relationship("TapAssignment", back_populates="keg_instance")
    consumption_events = relationship("ConsumptionEvent", back_populates="keg_instance")
    session_lines = relationship("InventorySessionLine", back_populates="keg_instance")
    
    def __repr__(self):
        return f"<KegInstance(id={self.id}, item={self.inventory_item_id}, status='{self.status}')>"
    
    def get_remaining_oz(self, as_of_date: datetime = None) -> float:
        """Calculate remaining oz based on consumption events"""
        if as_of_date is None:
            as_of_date = datetime.utcnow()
        
        # Start with full keg
        remaining = self.starting_oz
        
        # Subtract all consumption events for this keg before as_of_date
        for event in self.consumption_events:
            if event.event_ts <= as_of_date:
                remaining += event.quantity_delta  # Delta is negative for consumption
        
        return max(0, remaining)


class TapLine(Base):
    """
    Tap Line model
    Represents physical tap lines at a location
    """
    __tablename__ = "tap_lines"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    location = relationship("Location", back_populates="tap_lines")
    tap_assignments = relationship("TapAssignment", back_populates="tap_line")
    pos_item_mappings = relationship("POSItemMapping", back_populates="tap_line")
    consumption_events = relationship("ConsumptionEvent", back_populates="tap_line")
    session_lines = relationship("InventorySessionLine", back_populates="tap_line")
    
    def __repr__(self):
        return f"<TapLine(id={self.id}, name='{self.name}')>"
    
    def get_active_assignment(self, as_of_date: datetime = None) -> 'TapAssignment':
        """Get the active tap assignment at a specific time"""
        if as_of_date is None:
            as_of_date = datetime.utcnow()
        
        for assignment in self.tap_assignments:
            if assignment.effective_start_ts <= as_of_date:
                if assignment.effective_end_ts is None or assignment.effective_end_ts > as_of_date:
                    return assignment
        
        return None


class TapAssignment(Base):
    """
    Tap Assignment model
    Maps kegs to tap lines with effective time ranges
    Supports keg swap repair/reallocation
    """
    __tablename__ = "tap_assignments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    tap_line_id = Column(UUID(as_uuid=True), ForeignKey("tap_lines.id"), nullable=False, index=True)
    keg_instance_id = Column(UUID(as_uuid=True), ForeignKey("keg_instances.id"), nullable=False)
    effective_start_ts = Column(DateTime, nullable=False, index=True)
    effective_end_ts = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    __table_args__ = (
        CheckConstraint(
            'effective_end_ts IS NULL OR effective_end_ts > effective_start_ts',
            name='check_assignment_time_range'
        ),
    )
    
    # Relationships
    location = relationship("Location", back_populates="tap_assignments")
    tap_line = relationship("TapLine", back_populates="tap_assignments")
    keg_instance = relationship("KegInstance", back_populates="tap_assignments")
    
    def __repr__(self):
        return f"<TapAssignment(tap={self.tap_line_id}, keg={self.keg_instance_id}, start={self.effective_start_ts})>"


class PourProfile(Base):
    """
    Pour Profile model
    Standard pour sizes (pint, half pint, etc.)
    Used to convert POS sales to oz depletion
    """
    __tablename__ = "pour_profiles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    name = Column(String, nullable=False)
    oz = Column(Float, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    location = relationship("Location", back_populates="pour_profiles")
    pos_item_mappings = relationship("POSItemMapping", back_populates="pour_profile")
    
    def __repr__(self):
        return f"<PourProfile(id={self.id}, name='{self.name}', oz={self.oz})>"
