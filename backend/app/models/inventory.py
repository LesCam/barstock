"""
Inventory Item Models
Handles products, barcodes, and price history
"""

from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.core.database import Base


class InventoryItemType(str, enum.Enum):
    """Inventory item type enumeration"""
    packaged_beer = "packaged_beer"
    keg_beer = "keg_beer"
    liquor = "liquor"
    wine = "wine"
    food = "food"
    misc = "misc"


class UOMEnum(str, enum.Enum):
    """Unit of measure enumeration"""
    units = "units"
    oz = "oz"
    ml = "ml"
    grams = "grams"


class InventoryItem(Base):
    """
    Inventory Item model
    Represents products tracked in inventory (beer, liquor, wine, food, etc.)
    """
    __tablename__ = "inventory_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False, index=True)
    type = Column(SQLEnum(InventoryItemType, name="inventory_item_type_t"), nullable=False)
    name = Column(String, nullable=False)
    barcode = Column(String, nullable=True)
    vendor_sku = Column(String, nullable=True)
    base_uom = Column(SQLEnum(UOMEnum, name="uom_t"), nullable=False)
    pack_size = Column(Float, nullable=True)
    pack_uom = Column(SQLEnum(UOMEnum, name="uom_t"), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    location = relationship("Location", back_populates="inventory_items")
    price_history = relationship("PriceHistory", back_populates="inventory_item", cascade="all, delete-orphan")
    keg_instances = relationship("KegInstance", back_populates="inventory_item")
    pos_item_mappings = relationship("POSItemMapping", back_populates="inventory_item")
    consumption_events = relationship("ConsumptionEvent", back_populates="inventory_item")
    session_lines = relationship("InventorySessionLine", back_populates="inventory_item")
    bottle_templates = relationship("BottleTemplate", back_populates="inventory_item")
    bottle_measurements = relationship("BottleMeasurement", back_populates="inventory_item")
    
    def __repr__(self):
        return f"<InventoryItem(id={self.id}, name='{self.name}', type='{self.type}')>"
    
    def get_current_price(self, as_of_date: datetime = None) -> float:
        """Get current unit cost as of a specific date"""
        if as_of_date is None:
            as_of_date = datetime.utcnow()
        
        # Find most recent price effective before as_of_date
        for price in sorted(self.price_history, key=lambda p: p.effective_from_ts, reverse=True):
            if price.effective_from_ts <= as_of_date:
                if price.effective_to_ts is None or price.effective_to_ts > as_of_date:
                    return price.unit_cost
        
        return None


class PriceHistory(Base):
    """
    Price History model
    Tracks unit cost changes over time with effective dates
    """
    __tablename__ = "price_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False, index=True)
    unit_cost = Column(Float, nullable=False)
    currency = Column(String, nullable=False, default="CAD")
    effective_from_ts = Column(DateTime, nullable=False, index=True)
    effective_to_ts = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    inventory_item = relationship("InventoryItem", back_populates="price_history")
    
    def __repr__(self):
        return f"<PriceHistory(item_id={self.inventory_item_id}, cost={self.unit_cost}, effective={self.effective_from_ts})>"
