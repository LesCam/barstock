"""
Variance Service
Calculates and analyzes inventory variance
"""

from sqlalchemy.orm import Session
from datetime import datetime
import uuid
from typing import List, Dict

from app.models import ConsumptionEvent, InventoryItem, EventType


class VarianceService:
    """Variance analysis and reporting"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def calculate_variance_report(
        self,
        location_id: uuid.UUID,
        from_date: datetime,
        to_date: datetime
    ) -> Dict:
        """Generate variance report"""
        
        items = []
        total_variance_value = 0.0
        
        inventory_items = self.db.query(InventoryItem).filter(
            InventoryItem.location_id == location_id,
            InventoryItem.active == True
        ).all()
        
        for item in inventory_items:
            # Theoretical (from POS depletion)
            theoretical_events = self.db.query(ConsumptionEvent).filter(
                ConsumptionEvent.inventory_item_id == item.id,
                ConsumptionEvent.event_ts >= from_date,
                ConsumptionEvent.event_ts < to_date,
                ConsumptionEvent.event_type == EventType.pos_sale
            ).all()
            
            theoretical = sum(e.quantity_delta for e in theoretical_events)
            
            # Actual (from count adjustments)
            actual_events = self.db.query(ConsumptionEvent).filter(
                ConsumptionEvent.inventory_item_id == item.id,
                ConsumptionEvent.event_ts >= from_date,
                ConsumptionEvent.event_ts < to_date,
                ConsumptionEvent.event_type == EventType.inventory_count_adjustment
            ).all()
            
            adjustments = sum(e.quantity_delta for e in actual_events)
            actual = theoretical + adjustments
            
            variance = actual - theoretical
            variance_percent = (variance / abs(theoretical) * 100) if theoretical != 0 else 0
            
            current_price = item.get_current_price()
            value_impact = variance * current_price if current_price else None
            
            if value_impact:
                total_variance_value += abs(value_impact)
            
            items.append({
                "inventory_item_id": item.id,
                "item_name": item.name,
                "theoretical": abs(theoretical),
                "actual": abs(actual),
                "variance": variance,
                "variance_percent": variance_percent,
                "uom": item.base_uom.value,
                "unit_cost": current_price,
                "value_impact": value_impact
            })
        
        return {
            "location_id": location_id,
            "from_date": from_date,
            "to_date": to_date,
            "items": items,
            "total_variance_value": total_variance_value
        }
