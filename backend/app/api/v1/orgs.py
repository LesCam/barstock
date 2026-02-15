"""
Organization and Location Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models import Org, Location
from app.schemas.org import (
    OrgCreate,
    OrgUpdate,
    OrgResponse,
    LocationCreate,
    LocationUpdate,
    LocationResponse,
)

router = APIRouter()


@router.post("/", response_model=OrgResponse)
def create_org(
    org_data: OrgCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """Create new organization (admin only)"""
    org = Org(name=org_data.name)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("/", response_model=List[OrgResponse])
def list_orgs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List all organizations"""
    orgs = db.query(Org).all()
    return orgs


@router.get("/{org_id}", response_model=OrgResponse)
def get_org(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get organization by ID"""
    org = db.query(Org).filter(Org.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.patch("/{org_id}", response_model=OrgResponse)
def update_org(
    org_id: uuid.UUID,
    org_data: OrgUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """Update organization (admin only)"""
    org = db.query(Org).filter(Org.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    if org_data.name is not None:
        org.name = org_data.name
    
    db.commit()
    db.refresh(org)
    return org


@router.get("/{org_id}/locations", response_model=List[LocationResponse])
def list_org_locations(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List all locations in an organization"""
    locations = db.query(Location).filter(Location.org_id == org_id).all()
    return locations


@router.post("/{org_id}/locations", response_model=LocationResponse)
def create_location(
    org_id: uuid.UUID,
    location_data: LocationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """Create new location in organization (admin only)"""
    location = Location(
        org_id=org_id,
        name=location_data.name,
        timezone=location_data.timezone,
        closeout_hour=location_data.closeout_hour
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.patch("/locations/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: uuid.UUID,
    location_data: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """Update location (admin only)"""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    if location_data.name is not None:
        location.name = location_data.name
    if location_data.timezone is not None:
        location.timezone = location_data.timezone
    if location_data.closeout_hour is not None:
        location.closeout_hour = location_data.closeout_hour
    
    db.commit()
    db.refresh(location)
    return location
