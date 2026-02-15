"""
Inventory Session Models
Handles physical inventory counting sessions
"""

from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.core.database import Base


class SessionType(str, enum.Enum):
    """Session type enumeration"""
    shift = "shift"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class InventorySession(Base):
    """
    Inventory Session model
    Represents a physical inventory counting session
    
    Workflow:
    1. Create session (started_ts set)
    2. Add session lines (counts)
    3. Close session (ended_ts set, adjustments created)
    """
    __tablename__ = "inventory_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    session_type = Column(SQLEnum(SessionType, name="session_type_t"), nullable=False)
    started_ts = Column(DateTime, nullable=False)
    ended_ts = Column(DateTime, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    closed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    location = relationship("Location", back_populates="inventory_sessions")
    creator = relationship(
        "User",
        back_populates="created_sessions",
        foreign_keys=[created_by]
    )
    closer = relationship(
        "User",
        back_populates="closed_sessions",
        foreign_keys=[closed_by]
    )
    lines = relationship("InventorySessionLine", back_populates="session", cascade="all, delete-orphan")
    bottle_measurements = relationship("BottleMeasurement", back_populates="session")
    
    def __repr__(self):
        return f"<InventorySession(id={self.id}, type='{self.session_type}', started={self.started_ts})>"
    
    def is_closed(self) -> bool:
        """Check if session is closed"""
        return self.ended_ts is not None


class InventorySessionLine(Base):
    """
    Inventory Session Line model
    Individual item counts within a session
    
    Supports three count methods:
    1. Packaged: count_units
    2. Draft: percent_remaining (of keg)
    3. Liquor: gross_weight_grams (from scale)
    """
    __tablename__ = "inventory_session_lines"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("inventory_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False)
    
    # Packaged count
    count_units = Column(Float, nullable=True)
    
    # Draft keg count
    tap_line_id = Column(UUID(as_uuid=True), ForeignKey("tap_lines.id"), nullable=True)
    keg_instance_id = Column(UUID(as_uuid=True), ForeignKey("keg_instances.id"), nullable=True)
    percent_remaining = Column(Float, nullable=True)
    
    # Liquor weight count
    gross_weight_grams = Column(Float, nullable=True)
    is_manual = Column(Boolean, nullable=False, default=False)
    
    # Scale integration (v1.1)
    derived_ml = Column(Float, nullable=True)
    derived_oz = Column(Float, nullable=True)
    bottle_template_id = Column(UUID(as_uuid=True), ForeignKey("bottle_templates.id"), nullable=True)
    confidence_level = Column(String, nullable=True)
    
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    __table_args__ = (
        CheckConstraint(
            'percent_remaining IS NULL OR (percent_remaining >= 0 AND percent_remaining <= 100)',
            name='check_percent_remaining_range'
        ),
        CheckConstraint(
            'gross_weight_grams IS NULL OR gross_weight_grams >= 0',
            name='check_gross_weight_positive'
        ),
    )
    
    # Relationships
    session = relationship("InventorySession", back_populates="lines")
    inventory_item = relationship("InventoryItem", back_populates="session_lines")
    tap_line = relationship("TapLine", back_populates="session_lines")
    keg_instance = relationship("KegInstance", back_populates="session_lines")
    bottle_template = relationship("BottleTemplate", back_populates="session_lines")
    
    def __repr__(self):
        return f"<InventorySessionLine(session={self.session_id}, item={self.inventory_item_id})>"
    
    def get_counted_quantity(self) -> tuple:
        """
        Get the counted quantity and UOM for this line
        Returns: (quantity, uom)
        """
        if self.count_units is not None:
            return (self.count_units, "units")
        
        elif self.percent_remaining is not None and self.keg_instance_id is not None:
            # Calculate oz from percentage
            # This requires loading the keg_instance to get starting_oz
            if self.keg_instance:
                remaining_oz = (self.percent_remaining / 100.0) * self.keg_instance.starting_oz
                return (remaining_oz, "oz")
        
        elif self.derived_oz is not None:
            return (self.derived_oz, "oz")
        
        elif self.gross_weight_grams is not None:
            return (self.gross_weight_grams, "grams")
        
        return (None, None)
