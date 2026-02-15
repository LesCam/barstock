"""
Inventory Item Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class InventoryItemBase(BaseModel):
    """Base inventory item schema"""
    name: str = Field(..., min_length=1, max_length=255)
    type: str  # packaged_beer, keg_beer, liquor, wine, food, misc
    barcode: Optional[str] = None
    vendor_sku: Optional[str] = None
    base_uom: str  # units, oz, ml, grams
    pack_size: Optional[float] = None
    pack_uom: Optional[str] = None


class InventoryItemCreate(InventoryItemBase):
    """Create inventory item request"""
    location_id: uuid.UUID


class InventoryItemUpdate(BaseModel):
    """Update inventory item request"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    type: Optional[str] = None
    barcode: Optional[str] = None
    vendor_sku: Optional[str] = None
    base_uom: Optional[str] = None
    pack_size: Optional[float] = None
    pack_uom: Optional[str] = None
    active: Optional[bool] = None


class InventoryItemResponse(InventoryItemBase):
    """Inventory item response"""
    id: uuid.UUID
    location_id: uuid.UUID
    active: bool
    created_at: datetime
    current_price: Optional[float] = None  # Computed field
    
    class Config:
        from_attributes = True


class PriceHistoryBase(BaseModel):
    """Base price history schema"""
    unit_cost: float = Field(..., ge=0)
    currency: str = Field(default="CAD")
    effective_from_ts: datetime


class PriceHistoryCreate(PriceHistoryBase):
    """Create price history request"""
    inventory_item_id: uuid.UUID
    effective_to_ts: Optional[datetime] = None


class PriceHistoryResponse(PriceHistoryBase):
    """Price history response"""
    id: uuid.UUID
    inventory_item_id: uuid.UUID
    effective_to_ts: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class OnHandResponse(BaseModel):
    """On-hand inventory response"""
    inventory_item_id: uuid.UUID
    item_name: str
    quantity: float
    uom: str
    as_of_date: datetime
    unit_cost: Optional[float] = None
    total_value: Optional[float] = None
