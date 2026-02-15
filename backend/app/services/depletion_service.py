"""
Depletion Engine Service
Converts canonical SalesLine records into ConsumptionEvents

This is the CORE of the inventory system:
- POS-agnostic: only consumes canonical SalesLine records
- Creates immutable ConsumptionEvents in the ledger
- Handles voids/refunds via reversal events
- Uses mappings to determine how to deplete inventory
"""

from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime
import logging
import uuid

from app.models import (
    SalesLine,
    ConsumptionEvent,
    POSItemMapping,
    TapAssignment,
    EventType,
    ConfidenceLevel,
    SourceSystem,
    MappingMode,
    UOMEnum
)

logger = logging.getLogger(__name__)


class DepletionEngine:
    """
    Depletion Engine - Converts POS sales to inventory consumption
    
    Key principles:
    1. POS-agnostic: only works with canonical SalesLine
    2. Idempotent: safe to re-run on same sales data
    3. Immutable: creates events, never updates them
    4. Auditable: all consumption is traceable to source
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def process_sales_lines(
        self,
        location_id: uuid.UUID,
        from_ts: datetime,
        to_ts: datetime
    ) -> Dict[str, int]:
        """
        Process all sales lines in a time window
        
        Args:
            location_id: Location to process
            from_ts: Start timestamp
            to_ts: End timestamp
            
        Returns:
            dict with counts: {processed, created, unmapped, skipped}
        """
        logger.info(f"Processing sales for location {location_id} from {from_ts} to {to_ts}")
        
        # Get sales lines in window that haven't been depleted
        sales_lines = self.db.query(SalesLine).filter(
            SalesLine.location_id == location_id,
            SalesLine.sold_at >= from_ts,
            SalesLine.sold_at < to_ts
        ).all()
        
        stats = {
            "processed": 0,
            "created": 0,
            "unmapped": 0,
            "skipped": 0
        }
        
        for sales_line in sales_lines:
            # Skip if already depleted
            if self._is_already_depleted(sales_line.id):
                stats["skipped"] += 1
                continue
            
            stats["processed"] += 1
            
            # Get active mapping for this POS item
            mapping = self._get_active_mapping(
                location_id,
                sales_line.source_system,
                sales_line.pos_item_id,
                sales_line.sold_at
            )
            
            if not mapping:
                logger.debug(f"No mapping for POS item {sales_line.pos_item_id}")
                stats["unmapped"] += 1
                continue
            
            # Create consumption event(s) based on mapping mode
            events_created = self._create_consumption_events(sales_line, mapping)
            stats["created"] += events_created
        
        self.db.commit()
        
        logger.info(f"Depletion complete: {stats}")
        return stats
    
    def _is_already_depleted(self, sales_line_id: uuid.UUID) -> bool:
        """Check if sales line already has consumption events"""
        existing = self.db.query(ConsumptionEvent).filter(
            ConsumptionEvent.sales_line_id == sales_line_id
        ).first()
        return existing is not None
    
    def _get_active_mapping(
        self,
        location_id: uuid.UUID,
        source_system: SourceSystem,
        pos_item_id: str,
        as_of_date: datetime
    ) -> Optional[POSItemMapping]:
        """
        Get the active mapping for a POS item at a specific time
        
        This handles versioned mappings with effective dates
        """
        mapping = self.db.query(POSItemMapping).filter(
            POSItemMapping.location_id == location_id,
            POSItemMapping.source_system == source_system,
            POSItemMapping.pos_item_id == pos_item_id,
            POSItemMapping.active == True,
            POSItemMapping.effective_from_ts <= as_of_date,
            (POSItemMapping.effective_to_ts.is_(None) | 
             (POSItemMapping.effective_to_ts > as_of_date))
        ).first()
        
        return mapping
    
    def _create_consumption_events(
        self,
        sales_line: SalesLine,
        mapping: POSItemMapping
    ) -> int:
        """
        Create consumption event(s) for a sales line
        
        Returns: number of events created
        """
        # Handle voids/refunds first
        if sales_line.is_voided or sales_line.is_refunded:
            return self._create_reversal_event(sales_line, mapping)
        
        # Normal depletion based on mapping mode
        if mapping.mode == MappingMode.packaged_unit:
            return self._deplete_packaged(sales_line, mapping)
        
        elif mapping.mode == MappingMode.draft_by_tap:
            return self._deplete_draft_by_tap(sales_line, mapping)
        
        elif mapping.mode == MappingMode.draft_by_product:
            return self._deplete_draft_by_product(sales_line, mapping)
        
        else:
            logger.error(f"Unknown mapping mode: {mapping.mode}")
            return 0
    
    def _deplete_packaged(
        self,
        sales_line: SalesLine,
        mapping: POSItemMapping
    ) -> int:
        """
        Deplete packaged inventory (bottles, cans, cases)
        Simple: subtract units
        """
        event = ConsumptionEvent(
            location_id=sales_line.location_id,
            event_type=EventType.pos_sale,
            source_system=sales_line.source_system,
            event_ts=sales_line.sold_at,
            inventory_item_id=mapping.inventory_item_id,
            receipt_id=sales_line.receipt_id,
            sales_line_id=sales_line.id,
            quantity_delta=-sales_line.quantity,  # Negative = consumption
            uom=UOMEnum.units,
            confidence_level=ConfidenceLevel.theoretical,
            notes=f"POS sale: {sales_line.pos_item_name}"
        )
        
        self.db.add(event)
        logger.debug(f"Created packaged depletion: {sales_line.quantity} units")
        return 1
    
    def _deplete_draft_by_tap(
        self,
        sales_line: SalesLine,
        mapping: POSItemMapping
    ) -> int:
        """
        Deplete draft beer by tap line
        
        Requires:
        - Pour profile (oz per pour)
        - Active tap assignment at sold_at time
        """
        if not mapping.pour_profile_id:
            logger.error(f"No pour profile for draft mapping {mapping.id}")
            return 0
        
        # Get pour profile
        from app.models import PourProfile
        pour_profile = self.db.query(PourProfile).filter(
            PourProfile.id == mapping.pour_profile_id
        ).first()
        
        if not pour_profile:
            logger.error(f"Pour profile {mapping.pour_profile_id} not found")
            return 0
        
        # Calculate oz to deplete
        oz_depleted = sales_line.quantity * pour_profile.oz
        
        # Get active tap assignment at sale time
        tap_assignment = None
        if mapping.tap_line_id:
            tap_assignment = self.db.query(TapAssignment).filter(
                TapAssignment.tap_line_id == mapping.tap_line_id,
                TapAssignment.effective_start_ts <= sales_line.sold_at,
                (TapAssignment.effective_end_ts.is_(None) | 
                 (TapAssignment.effective_end_ts > sales_line.sold_at))
            ).first()
        
        if not tap_assignment:
            logger.warning(f"No tap assignment for tap {mapping.tap_line_id} at {sales_line.sold_at}")
            # Could go to unresolved queue or create event without keg
            return 0
        
        # Create consumption event
        event = ConsumptionEvent(
            location_id=sales_line.location_id,
            event_type=EventType.pos_sale,
            source_system=sales_line.source_system,
            event_ts=sales_line.sold_at,
            inventory_item_id=mapping.inventory_item_id,
            keg_instance_id=tap_assignment.keg_instance_id,
            tap_line_id=mapping.tap_line_id,
            receipt_id=sales_line.receipt_id,
            sales_line_id=sales_line.id,
            quantity_delta=-oz_depleted,  # Negative = consumption
            uom=UOMEnum.oz,
            confidence_level=ConfidenceLevel.theoretical,
            notes=f"Draft sale: {sales_line.pos_item_name}, {pour_profile.name}"
        )
        
        self.db.add(event)
        logger.debug(f"Created draft depletion: {oz_depleted} oz from keg {tap_assignment.keg_instance_id}")
        return 1
    
    def _deplete_draft_by_product(
        self,
        sales_line: SalesLine,
        mapping: POSItemMapping
    ) -> int:
        """
        Deplete draft beer by product (not recommended)
        
        Finds any active keg of this product and depletes it
        This is less accurate than draft_by_tap
        """
        # Similar to draft_by_tap but finds any keg with this item
        # Not implemented in detail as it's not recommended
        logger.warning("draft_by_product mode not recommended - use draft_by_tap")
        return 0
    
    def _create_reversal_event(
        self,
        sales_line: SalesLine,
        mapping: POSItemMapping
    ) -> int:
        """
        Create reversal event for voided/refunded sale
        
        This is a positive quantity event that reverses the original depletion
        """
        # For simplicity, we create a positive event
        # In production, you might want to find the original event and link it
        
        if mapping.mode == MappingMode.packaged_unit:
            quantity = sales_line.quantity
            uom = UOMEnum.units
        else:  # Draft
            pour_profile = self.db.query(PourProfile).filter(
                PourProfile.id == mapping.pour_profile_id
            ).first()
            quantity = sales_line.quantity * (pour_profile.oz if pour_profile else 16)
            uom = UOMEnum.oz
        
        event = ConsumptionEvent(
            location_id=sales_line.location_id,
            event_type=EventType.pos_sale,
            source_system=sales_line.source_system,
            event_ts=sales_line.sold_at,
            inventory_item_id=mapping.inventory_item_id,
            receipt_id=sales_line.receipt_id,
            sales_line_id=sales_line.id,
            quantity_delta=quantity,  # POSITIVE = reversal
            uom=uom,
            confidence_level=ConfidenceLevel.theoretical,
            notes=f"Void/Refund reversal: {sales_line.pos_item_name}"
        )
        
        self.db.add(event)
        logger.debug(f"Created reversal event for void/refund")
        return 1
    
    def correct_event(
        self,
        original_event_id: uuid.UUID,
        new_quantity_delta: float,
        new_uom: UOMEnum,
        reason: str
    ) -> tuple[uuid.UUID, uuid.UUID]:
        """
        Correct an event via reversal + replacement pattern
        
        Returns: (reversal_event_id, replacement_event_id)
        """
        # Get original event
        original = self.db.query(ConsumptionEvent).filter(
            ConsumptionEvent.id == original_event_id
        ).first()
        
        if not original:
            raise ValueError(f"Event {original_event_id} not found")
        
        # Create reversal
        reversal = ConsumptionEvent(
            location_id=original.location_id,
            event_type=original.event_type,
            source_system=SourceSystem.manual,
            event_ts=datetime.utcnow(),
            inventory_item_id=original.inventory_item_id,
            keg_instance_id=original.keg_instance_id,
            tap_line_id=original.tap_line_id,
            quantity_delta=-original.quantity_delta,  # Opposite sign
            uom=original.uom,
            confidence_level=ConfidenceLevel.estimated,
            reversal_of_event_id=original_event_id,
            notes=f"Correction reversal: {reason}"
        )
        
        # Create replacement
        replacement = ConsumptionEvent(
            location_id=original.location_id,
            event_type=original.event_type,
            source_system=SourceSystem.manual,
            event_ts=datetime.utcnow(),
            inventory_item_id=original.inventory_item_id,
            keg_instance_id=original.keg_instance_id,
            tap_line_id=original.tap_line_id,
            quantity_delta=new_quantity_delta,
            uom=new_uom,
            confidence_level=ConfidenceLevel.estimated,
            notes=f"Correction replacement: {reason}"
        )
        
        self.db.add(reversal)
        self.db.add(replacement)
        self.db.commit()
        
        logger.info(f"Corrected event {original_event_id}: reversal={reversal.id}, replacement={replacement.id}")
        
        return (reversal.id, replacement.id)
