"""
Inventory Service
Calculates on-hand inventory and manages items
"""

from sqlalchemy.orm import Session
from datetime import datetime
import uuid
from typing import Dict, List

from app.models import ConsumptionEvent, InventoryItem


class InventoryService:
    """Inventory calculations and management"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def calculate_on_hand(
        self,
        location_id: uuid.UUID,
        as_of: datetime = None
    ) -> List[Dict]:
        """Calculate on-hand inventory for all items"""
        
        if as_of is None:
            as_of = datetime.utcnow()
        
        items = self.db.query(InventoryItem).filter(
            InventoryItem.location_id == location_id,
            InventoryItem.active == True
        ).all()
        
        results = []
        
        for item in items:
            # Sum all events for this item
            events = self.db.query(ConsumptionEvent).filter(
                ConsumptionEvent.inventory_item_id == item.id,
                ConsumptionEvent.event_ts <= as_of
            ).all()
            
            on_hand = sum(e.quantity_delta for e in events)
            
            # Get current price
            current_price = item.get_current_price(as_of)
            
            results.append({
                "inventory_item_id": item.id,
                "item_name": item.name,
                "quantity": on_hand,
                "uom": item.base_uom.value,
                "unit_cost": current_price,
                "total_value": on_hand * current_price if current_price else None,
                "as_of_date": as_of
            })
        
        return results
