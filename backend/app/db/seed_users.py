"""
DRISHTI-X — User Seed Script
Seeds default clinical and administrative test accounts.
"""
from app.db.base import SessionLocal, engine, Base
from app.models.user import User, UserRole
from app.core.security import hash_password

DEFAULT_USERS = [
    {
        "email": "worker@drishti.org",
        "full_name": "Sita Patel (Community Health Worker)",
        "password": "worker123",
        "role": UserRole.HEALTH_WORKER,
        "facility_name": "Primary Health Centre - Rampur",
        "facility_location": "Varanasi, UP",
    },
    {
        "email": "doctor@drishti.org",
        "full_name": "Dr. Ramesh Gupta, MS (Ophth)",
        "password": "doctor123",
        "role": UserRole.OPHTHALMOLOGIST,
        "facility_name": "Apex Eye Hospital & Retina Institute",
        "facility_location": "New Delhi",
    },
    {
        "email": "testdoc@example.com",
        "full_name": "Dr. Ramesh Gupta, MS (Ophth)",
        "password": "doctor123",
        "role": UserRole.OPHTHALMOLOGIST,
        "facility_name": "Apex Eye Hospital & Retina Institute",
        "facility_location": "New Delhi",
    },
    {
        "email": "admin@drishti.org",
        "full_name": "Systems Administrator",
        "password": "admin123",
        "role": UserRole.ADMIN,
        "facility_name": "DRISHTI-X National Command Center",
        "facility_location": "New Delhi",
    },
]

def seed_users():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        created = 0
        updated = 0
        for u_data in DEFAULT_USERS:
            existing = db.query(User).filter(User.email == u_data["email"]).first()
            if not existing:
                user = User(
                    email=u_data["email"],
                    full_name=u_data["full_name"],
                    hashed_password=hash_password(u_data["password"]),
                    role=u_data["role"],
                    is_active=True,
                    is_verified=True,
                    facility_name=u_data["facility_name"],
                    facility_location=u_data["facility_location"],
                )
                db.add(user)
                created += 1
            else:
                existing.role = u_data["role"]
                existing.is_active = True
                existing.hashed_password = hash_password(u_data["password"])
                existing.facility_name = u_data["facility_name"]
                existing.facility_location = u_data["facility_location"]
                updated += 1
        db.commit()
        print(f"User seeding complete. Created: {created}, Updated: {updated}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_users()

