#!/usr/bin/env python3
"""
BarStock Database Setup Script
Creates test organization, location, and admin user
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.database import SessionLocal, engine, Base
from app.models import Org, Location, User, UserLocation, RoleEnum
from app.core.security import get_password_hash
from datetime import datetime

def setup_database():
    """Initialize database with test data"""
    
    print("🚀 Setting up BarStock database...")
    
    # Create all tables
    print("📊 Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created")
    
    # Create session
    db = SessionLocal()
    
    try:
        # Check if data already exists
        existing_org = db.query(Org).first()
        if existing_org:
            print("⚠️  Database already has data. Skipping setup.")
            print(f"   Existing org: {existing_org.name}")
            return
        
        # Create organization
        print("\n📦 Creating organization...")
        org = Org(name="Demo Restaurant Group")
        db.add(org)
        db.flush()
        print(f"✅ Created org: {org.name} (ID: {org.id})")
        
        # Create location
        print("\n📍 Creating location...")
        location = Location(
            org_id=org.id,
            name="Downtown Bar & Grill",
            timezone="America/Montreal",
            closeout_hour=4
        )
        db.add(location)
        db.flush()
        print(f"✅ Created location: {location.name} (ID: {location.id})")
        
        # Create admin user
        print("\n👤 Creating admin user...")
        admin = User(
            email="admin@barstock.com",
            password_hash=get_password_hash("admin123"),
            role=RoleEnum.admin,
            location_id=location.id,
            is_active=True
        )
        db.add(admin)
        db.flush()
        print(f"✅ Created user: {admin.email}")
        
        # Grant location access
        print("\n🔐 Granting location access...")
        user_location = UserLocation(
            user_id=admin.id,
            location_id=location.id,
            role=RoleEnum.admin
        )
        db.add(user_location)
        db.flush()
        print(f"✅ Granted admin access to {location.name}")
        
        # Commit all changes
        db.commit()
        
        print("\n" + "="*60)
        print("🎉 Database setup complete!")
        print("="*60)
        print("\n📝 Login credentials:")
        print(f"   Email:    admin@barstock.com")
        print(f"   Password: admin123")
        print("\n🌐 API endpoints:")
        print(f"   API Docs: http://localhost:8000/docs")
        print(f"   Login:    POST http://localhost:8000/v1/auth/login")
        print("\n💡 Test the login:")
        print('   curl -X POST http://localhost:8000/v1/auth/login \\')
        print('     -H "Content-Type: application/json" \\')
        print('     -d \'{"email":"admin@barstock.com","password":"admin123"}\'')
        print()
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    setup_database()
