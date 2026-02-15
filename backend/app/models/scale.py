"""
Scale and Bottle Template Models
Handles Bluetooth scale integration and bottle weight conversions
"""

from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.core.database import Base


class BottleTemplate(Base):
    """
    Bottle Template model
    Stores bottle specifications for weight-to-volume conversion
    
    Can be org-level (applies to all locations) or location-specific override
    """
    __tablename__ = "bottle_templates"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=True)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False, index=True)
    container_size_ml = Column(Float, nullable=False)
    empty_bottle_weight_g = Column(Float, nullable=False)
    full_bottle_weight_g = Column(Float, nullable=False)
    density_g_per_ml = Column(Float, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    org = relationship("Org")
    location = relationship("Location", back_populates="bottle_templates")
    inventory_item = relationship("InventoryItem", back_populates="bottle_templates")
    session_lines = relationship("InventorySessionLine", back_populates="bottle_template")
    
    def __repr__(self):
        return f"<BottleTemplate(id={self.id}, item={self.inventory_item_id}, size={self.container_size_ml}ml)>"
    
    def calculate_liquid(self, gross_weight_g: float) -> dict:
        """
        Calculate liquid volume from gross weight
        
        Args:
            gross_weight_g: Total weight of bottle + liquid
            
        Returns:
            dict with liquid_g, liquid_ml, liquid_oz, percent_full
        """
        # Calculate net liquid weight
        net_g = max(0, gross_weight_g - self.empty_bottle_weight_g)
        max_liquid_g = self.full_bottle_weight_g - self.empty_bottle_weight_g
        liquid_g = min(net_g, max_liquid_g)
        
        # Convert to volume using density
        density = self.density_g_per_ml or 0.95  # Default for spirits
        liquid_ml = liquid_g / density
        liquid_oz = liquid_ml * 0.033814
        
        # Calculate percentage
        percent_full = (liquid_g / max_liquid_g * 100) if max_liquid_g > 0 else 0
        
        return {
            "liquid_g": round(liquid_g, 2),
            "liquid_ml": round(liquid_ml, 2),
            "liquid_oz": round(liquid_oz, 2),
            "percent_full": round(percent_full, 1)
        }


class BottleMeasurement(Base):
    """
    Bottle Measurement model
    Records individual bottle weight measurements (from scale or manual)
    
    Stores raw grams as source of truth
    Derived volumes calculated using bottle templates
    """
    __tablename__ = "bottle_measurements"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False, index=True)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("inventory_sessions.id"), nullable=True)
    measured_at_ts = Column(DateTime, nullable=False, index=True)
    gross_weight_g = Column(Float, nullable=False)
    is_manual = Column(Boolean, nullable=False, default=False)
    confidence_level = Column(String, nullable=False)  # measured, estimated
    scale_device_id = Column(String, nullable=True)
    scale_device_name = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    __table_args__ = (
        CheckConstraint(
            'gross_weight_g >= 0',
            name='check_gross_weight_positive'
        ),
        CheckConstraint(
            "confidence_level IN ('measured', 'estimated')",
            name='check_confidence_level'
        ),
    )
    
    # Relationships
    location = relationship("Location", back_populates="bottle_measurements")
    inventory_item = relationship("InventoryItem", back_populates="bottle_measurements")
    session = relationship("InventorySession", back_populates="bottle_measurements")
    creator = relationship("User", back_populates="bottle_measurements")
    
    def __repr__(self):
        return f"<BottleMeasurement(id={self.id}, item={self.inventory_item_id}, weight={self.gross_weight_g}g, manual={self.is_manual})>"
    
    def get_derived_volumes(self, template: BottleTemplate = None) -> dict:
        """
        Calculate derived volumes using bottle template
        
        Args:
            template: Optional bottle template (will look up if not provided)
            
        Returns:
            dict with calculated volumes or None if no template
        """
        if template is None:
            # Try to find template for this item
            # This requires database access, so should be done at service layer
            return None
        
        return template.calculate_liquid(self.gross_weight_g)
