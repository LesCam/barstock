"""
Reports Schemas
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid


class VarianceItemResponse(BaseModel):
    """Single item variance"""
    inventory_item_id: uuid.UUID
    item_name: str
    theoretical: float
    actual: float
    variance: float
    variance_percent: float
    variance_reason: Optional[str] = None
    uom: str
    unit_cost: Optional[float] = None
    value_impact: Optional[float] = None


class VarianceReportResponse(BaseModel):
    """Variance report response"""
    location_id: uuid.UUID
    session_id: Optional[uuid.UUID] = None
    from_date: datetime
    to_date: datetime
    items: List[VarianceItemResponse]
    total_variance_value: float


class OnHandReportResponse(BaseModel):
    """On-hand inventory report"""
    location_id: uuid.UUID
    as_of_date: datetime
    items: List[dict]  # [{item_id, name, quantity, uom, value}]
    total_items: int
    total_value: float


class UsageReportResponse(BaseModel):
    """Usage report response"""
    location_id: uuid.UUID
    from_date: datetime
    to_date: datetime
    items: List[dict]  # [{item_id, name, quantity_used, uom}]
    total_sessions: int


class ValuationReportResponse(BaseModel):
    """Valuation report response"""
    location_id: uuid.UUID
    as_of_date: datetime
    total_valuation: float
    total_bottles: int
    by_category: dict  # {category: value}


class OrgRollupReportResponse(BaseModel):
    """Organization-level rollup report"""
    org_id: uuid.UUID
    report_type: str
    as_of_date: datetime
    locations: List[dict]  # Per-location data
    org_totals: dict  # Aggregated totals
