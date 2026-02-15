"""
Consumption Event Model - IMMUTABLE LEDGER
This is the source of truth for all inventory movements
"""

from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum as SQLEnum, Text, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.core.database import Base


class EventType(str, enum.Enum):
    """Consumption event type enumeration"""
    pos_sale = "pos_sale"
    tap_flow = "tap_flow"
    manual_adjustment = "manual_adjustment"
    inventory_count_adjustment = "inventory_count_adjustment"
    transfer = "transfer"


class ConfidenceLevel(str, enum.Enum):
    """Confidence level enumeration"""
    theoretical = "theoretical"
    measured = "measured"
    estimated = "estimated"


class VarianceReason(str, enum.Enum):
    """Variance reason enumeration"""
    waste_foam = "waste_foam"
    comp = "comp"
    staff_drink = "staff_drink"
    theft = "theft"
    breakage = "breakage"
    line_cleaning = "line_cleaning"
    transfer = "transfer"
    unknown = "unknown"


class UOMEnum(str, enum.Enum):
    """Unit of measure enumeration"""
    units = "units"
    oz = "oz"
    ml = "ml"
    grams = "grams"


class SourceSystem(str, enum.Enum):
    """Source system enumeration"""
    toast = "toast"
    square = "square"
    lightspeed = "lightspeed"
    clover = "clover"
    other = "other"
    manual = "manual"


class ConsumptionEvent(Base):
    """
    Consumption Event model - IMMUTABLE LEDGER
    
    CRITICAL: This table is APPEND-ONLY
    - Updates and deletes are BLOCKED by database triggers
    - Corrections must use reversal + replacement pattern
    - This ensures complete audit trail
    
    All inventory movements flow through this ledger:
    - POS sales (theoretical depletion)
    - Manual adjustments
    - Inventory count adjustments (variance)
    - Transfers between locations
    - Tap flow meter readings (future)
    """
    __tablename__ = "consumption_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False, index=True)
    event_type = Column(SQLEnum(EventType, name="event_type_t"), nullable=False)
    source_system = Column(SQLEnum(SourceSystem, name="source_system_t"), nullable=False)
    event_ts = Column(DateTime, nullable=False, index=True)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False, index=True)
    keg_instance_id = Column(UUID(as_uuid=True), ForeignKey("keg_instances.id"), nullable=True)
    tap_line_id = Column(UUID(as_uuid=True), ForeignKey("tap_lines.id"), nullable=True)
    receipt_id = Column(String, nullable=True)
    sales_line_id = Column(UUID(as_uuid=True), ForeignKey("sales_lines.id"), nullable=True)
    quantity_delta = Column(Float, nullable=False)
    uom = Column(SQLEnum(UOMEnum, name="uom_t"), nullable=False)
    confidence_level = Column(SQLEnum(ConfidenceLevel, name="confidence_level_t"), nullable=False)
    variance_reason = Column(SQLEnum(VarianceReason, name="variance_reason_t"), nullable=True)
    notes = Column(Text, nullable=True)
    reversal_of_event_id = Column(UUID(as_uuid=True), ForeignKey("consumption_events.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    
    # Relationships
    location = relationship("Location", back_populates="consumption_events")
    inventory_item = relationship("InventoryItem", back_populates="consumption_events")
    keg_instance = relationship("KegInstance", back_populates="consumption_events")
    tap_line = relationship("TapLine", back_populates="consumption_events")
    sales_line = relationship("SalesLine", back_populates="consumption_events")
    
    # Self-referential relationship for corrections
    reversal_of = relationship(
        "ConsumptionEvent",
        remote_side=[id],
        foreign_keys=[reversal_of_event_id]
    )
    
    def __repr__(self):
        return f"<ConsumptionEvent(id={self.id}, type='{self.event_type}', item={self.inventory_item_id}, delta={self.quantity_delta})>"
    
    def is_reversal(self) -> bool:
        """Check if this event is a reversal of another event"""
        return self.reversal_of_event_id is not None


# CRITICAL: Prevent updates and deletes at SQLAlchemy level
# The database has triggers too, but this adds an extra safety layer
@event.listens_for(ConsumptionEvent, 'before_update')
def block_consumption_event_update(mapper, connection, target):
    """Prevent updates to consumption events - they are immutable"""
    raise ValueError(
        "ConsumptionEvent records are immutable. "
        "Use correction endpoints to create reversal + replacement events."
    )


@event.listens_for(ConsumptionEvent, 'before_delete')
def block_consumption_event_delete(mapper, connection, target):
    """Prevent deletion of consumption events - they are immutable"""
    raise ValueError(
        "ConsumptionEvent records cannot be deleted. "
        "Use correction endpoints to create reversal events."
    )
