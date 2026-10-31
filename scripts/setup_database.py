"""
DRISHTI-X — One-time Database Setup Script
Run this once to create the drishti_x database and tables.

Usage:
    python3 scripts/setup_database.py

You will be prompted for the PostgreSQL postgres password once.
"""
import sys
import getpass

def setup():
    print("=" * 55)
    print("  DRISHTI-X — Database Setup")
    print("=" * 55)
    print()

    # Get connection details
    host = input("PostgreSQL host [localhost]: ").strip() or "localhost"
    port = input("PostgreSQL port [5432]: ").strip() or "5432"
    superuser = input("PostgreSQL superuser [postgres]: ").strip() or "postgres"
    password = getpass.getpass(f"Password for {superuser}: ")
    db_name = input("Database name to create [drishti_x]: ").strip() or "drishti_x"

    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    except ImportError:
        print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
        sys.exit(1)

    # Connect to postgres database to create drishti_x
    try:
        conn = psycopg2.connect(
            host=host, port=port,
            user=superuser, password=password,
            dbname="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        # Check if already exists
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        if cur.fetchone():
            print(f"✓ Database '{db_name}' already exists.")
        else:
            cur.execute(f'CREATE DATABASE "{db_name}"')
            print(f"✓ Database '{db_name}' created.")

        conn.close()
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    # Build the DATABASE_URL
    db_url = f"postgresql://{superuser}:{password}@{host}:{port}/{db_name}"

    # Write .env file
    env_path = "backend/.env"
    env_content = f"""APP_ENV=development
DEBUG=True
SECRET_KEY=drishti_x_dev_secret_change_in_production_abc123
DATABASE_URL={db_url}
MODEL_DIR=models/weights
MODEL_STATUS=TRAINED
DEMO_MODE=False
MATLAB_AVAILABLE=False
UPLOAD_DIR=uploads
"""
    with open(env_path, "w") as f:
        f.write(env_content)

    print(f"✓ .env written to {env_path}")
    print()

    # Create tables by importing the app
    print("Creating database tables...")
    try:
        import os
        os.environ["DATABASE_URL"] = db_url
        sys.path.insert(0, "backend")
        sys.path.insert(0, ".")

        # Reload settings with new DB URL
        from app.core.config import Settings
        s = Settings(DATABASE_URL=db_url)

        from sqlalchemy import create_engine
        from app.db.base import Base
        from app.models import User, Patient, Screening, FundusImage, Prediction
        from app.models import DoctorReview, Report, AuditLog, ModelVersion

        engine = create_engine(db_url, pool_pre_ping=True)
        Base.metadata.create_all(bind=engine)
        print("✓ All tables created.")
    except Exception as e:
        print(f"WARNING: Could not auto-create tables: {e}")
        print("Tables will be created on first backend startup.")

    # Create default admin user
    print()
    create_admin = input("Create default admin user? [y/N]: ").strip().lower()
    if create_admin == "y":
        from psycopg2 import connect
        import bcrypt, uuid
        admin_email = input("Admin email: ").strip()
        admin_name  = input("Admin name: ").strip()
        admin_pass  = getpass.getpass("Admin password: ")
        hashed = bcrypt.hashpw(admin_pass.encode(), bcrypt.gensalt()).decode()
        try:
            conn2 = connect(host=host, port=port, user=superuser,
                           password=password, dbname=db_name)
            cur2  = conn2.cursor()
            cur2.execute("""
                INSERT INTO users (id, email, full_name, hashed_password, role, is_active, is_verified)
                VALUES (%s, %s, %s, %s, 'ADMIN', true, true)
                ON CONFLICT (email) DO NOTHING
            """, (str(uuid.uuid4()), admin_email, admin_name, hashed))
            conn2.commit()
            conn2.close()
            print(f"✓ Admin user created: {admin_email}")
        except Exception as e:
            print(f"WARNING: Could not create admin user: {e}")

    print()
    print("=" * 55)
    print("  Setup complete!")
    print()
    print("  Start backend:")
    print("    cd drishti-x")
    print("    export PYTHONPATH=\"$(pwd)/backend:$(pwd)\"")
    print("    uvicorn app.main:app --reload --app-dir backend --port 8000")
    print()
    print("  Start frontend:")
    print("    cd drishti-x/frontend")
    print("    npm run dev")
    print()
    print("  Open: http://localhost:3000")
    print("=" * 55)


if __name__ == "__main__":
    setup()
