"""
Authentication Endpoints
Handles login, token refresh, and user management
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    require_admin
)
from app.models import User, UserLocation, RoleEnum
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    UserCreate,
    UserUpdate,
    UserResponse,
    CurrentUserResponse,
    UserLocationCreate,
    UserLocationResponse,
)

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Login with email and password
    Returns access and refresh tokens
    """
    # Find user by email
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Verify password
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Get user's location access
    user_locations = db.query(UserLocation).filter(
        UserLocation.user_id == user.id
    ).all()
    
    location_ids = [str(ul.location_id) for ul in user_locations]
    roles = {str(ul.location_id): ul.role.value for ul in user_locations}
    
    # Create token payload
    token_data = {
        "user_id": str(user.id),
        "email": user.email,
        "location_ids": location_ids,
        "roles": roles,
        "org_id": str(user.location.org_id) if user.location and user.location.org_id else None
    }
    
    # Generate tokens
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"user_id": str(user.id)})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=1800  # 30 minutes
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(request: RefreshTokenRequest, db: Session = Depends(get_db)):
    """
    Refresh access token using refresh token
    """
    try:
        payload = decode_token(request.refresh_token)
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        # Get user
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        # Get user locations
        user_locations = db.query(UserLocation).filter(
            UserLocation.user_id == user.id
        ).all()
        
        location_ids = [str(ul.location_id) for ul in user_locations]
        roles = {str(ul.location_id): ul.role.value for ul in user_locations}
        
        # Create new token payload
        token_data = {
            "user_id": str(user.id),
            "email": user.email,
            "location_ids": location_ids,
            "roles": roles,
            "org_id": str(user.location.org_id) if user.location and user.location.org_id else None
        }
        
        # Generate new tokens
        access_token = create_access_token(token_data)
        new_refresh_token = create_refresh_token({"user_id": str(user.id)})
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            expires_in=1800
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )


@router.get("/me", response_model=CurrentUserResponse)
def get_current_user_info(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Get current authenticated user information
    """
    user_id = uuid.UUID(current_user["user_id"])
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        role=user.role.value,
        location_id=user.location_id,
        is_active=user.is_active,
        created_at=user.created_at,
        location_ids=[uuid.UUID(loc_id) for loc_id in current_user["location_ids"]],
        roles=current_user["roles"],
        org_id=uuid.UUID(current_user["org_id"]) if current_user.get("org_id") else None
    )


@router.post("/users", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    Create a new user (admin only)
    """
    # Check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        role=RoleEnum(user_data.role),
        location_id=user_data.location_id,
        is_active=True
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user


@router.get("/users", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    List all users (admin only)
    """
    users = db.query(User).all()
    return users


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    Update user (admin only)
    """
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update fields
    if user_data.email is not None:
        # Check if new email already exists
        existing = db.query(User).filter(
            User.email == user_data.email,
            User.id != user_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
        user.email = user_data.email
    
    if user_data.password is not None:
        user.password_hash = get_password_hash(user_data.password)
    
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    db.commit()
    db.refresh(user)
    
    return user


@router.post("/user-locations", response_model=UserLocationResponse)
def grant_location_access(
    data: UserLocationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    Grant user access to a location with specific role (admin only)
    """
    # Check if mapping already exists
    existing = db.query(UserLocation).filter(
        UserLocation.user_id == data.user_id,
        UserLocation.location_id == data.location_id
    ).first()
    
    if existing:
        # Update existing role
        existing.role = RoleEnum(data.role)
        db.commit()
        db.refresh(existing)
        return existing
    
    # Create new mapping
    user_location = UserLocation(
        user_id=data.user_id,
        location_id=data.location_id,
        role=RoleEnum(data.role)
    )
    
    db.add(user_location)
    db.commit()
    db.refresh(user_location)
    
    return user_location


@router.delete("/user-locations/{user_id}/{location_id}")
def revoke_location_access(
    user_id: uuid.UUID,
    location_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    Revoke user's access to a location (admin only)
    """
    user_location = db.query(UserLocation).filter(
        UserLocation.user_id == user_id,
        UserLocation.location_id == location_id
    ).first()
    
    if not user_location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User location mapping not found"
        )
    
    db.delete(user_location)
    db.commit()
    
    return {"message": "Access revoked successfully"}
