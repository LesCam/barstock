"""
Session Service
Manages inventory counting sessions and creates adjustment events
"""

from sqlalchemy.orm import Session
from datetime import datetime
import uuid
from typing import Dict, List

from app.models import (
    InventorySession,
    InventorySessionLine,
    ConsumptionEvent,
    InventoryItem,
    EventType,
    ConfidenceLevel,
    VarianceReason,
    SourceSystem
)


class SessionService:
    """Inventory Session Management"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def close_session(
        self,
        session_id: uuid.UUID,
        variance_reasons: Dict[uuid.UUID, VarianceReason]
    ) -> Dict[str, any]:
        """Close inventory session and create adjustment events"""
        
        session = self.db.query(InventorySession).filter(
            InventorySession.id == session_id
        ).first()
        
        if not session:
            raise ValueError("Session not found")
        
        if session.ended_ts:
            raise ValueError("Session already closed")
        
        adjustments_created = 0
        total_variance = 0.0
        requires_reasons = []
        
        for line in session.lines:
            # Calculate theoretical
            theoretical = self._calculate_theoretical_on_hand(
                line.inventory_item_id,
                session.started_ts
            )
            
            # Calculate actual
            actual = self._get_actual_from_line(line)
            
            # Variance
            variance = actual - theoretical
            total_variance += abs(variance)
            
            # Check threshold
            threshold = 5.0  # Could be configurable
            
            if abs(variance) > threshold:
                if line.inventory_item_id not in variance_reasons:
                    requires_reasons.append(line.inventory_item_id)
                    continue
            
            # Create adjustment event
            if variance != 0:
                event = ConsumptionEvent(
                    location_id=session.location_id,
                    event_type=EventType.inventory_count_adjustment,
                    source_system=SourceSystem.manual,
                    event_ts=datetime.utcnow(),
                    inventory_item_id=line.inventory_item_id,
                    quantity_delta=variance,
                    uom='units',
                    confidence_level=ConfidenceLevel.measured,
                    variance_reason=variance_reasons.get(line.inventory_item_id),
                    notes=f"Session {session_id} adjustment"
                )
                self.db.add(event)
                adjustments_created += 1
        
        if requires_reasons:
            raise ValueError(f"Variance reasons required for items: {requires_reasons}")
        
        # Close session
        session.ended_ts = datetime.utcnow()
        self.db.commit()
        
        return {
            "session_id": session_id,
            "adjustments_created": adjustments_created,
            "total_variance": total_variance
        }
    
    def _calculate_theoretical_on_hand(self, item_id: uuid.UUID, as_of: datetime) -> float:
        """Calculate theoretical on-hand from ledger"""
        events = self.db.query(ConsumptionEvent).filter(
            ConsumptionEvent.inventory_item_id == item_id,
            ConsumptionEvent.event_ts <= as_of
        ).all()
        
        return sum(e.quantity_delta for e in events)
    
    def _get_actual_from_line(self, line: InventorySessionLine) -> float:
        """Extract actual count from session line"""
        if line.count_units is not None:
            return line.count_units
        
        if line.derived_oz is not None:
            return line.derived_oz
        
        return 0.0
