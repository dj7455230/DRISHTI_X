-- DRISHTI-X — Migration 003: Features 31–40
-- Low-Bandwidth Mode, Evidence Capsules, Priority-Aware Sync & Telemedicine Review

-- 1. Add capsule & sync tracking columns to screenings
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS capsule_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS full_image_pending BOOLEAN DEFAULT FALSE;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS sync_idempotency_key VARCHAR(128);
CREATE INDEX IF NOT EXISTS ix_screenings_sync_idempotency_key ON screenings(sync_idempotency_key);

-- 2. Create Evidence Capsules table (Feature 33)
CREATE TABLE IF NOT EXISTS evidence_capsules (
    id UUID PRIMARY KEY,
    screening_id UUID NOT NULL UNIQUE REFERENCES screenings(id) ON DELETE CASCADE,
    capsule_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    case_number VARCHAR(50) NOT NULL,
    patient_ref_id VARCHAR(100) NOT NULL,
    facility_code VARCHAR(100) NOT NULL DEFAULT 'PHC-RURAL-01',
    screening_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ai_engine VARCHAR(100) NOT NULL DEFAULT 'EfficientNet-B0 + U-Net',
    model_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    predicted_grade INTEGER,
    grade_label VARCHAR(50),
    confidence FLOAT,
    calibration_status VARCHAR(50) DEFAULT 'CALIBRATED',
    image_quality_status VARCHAR(50) DEFAULT 'OPTIMAL',
    assurance_decision VARCHAR(50) DEFAULT 'PENDING',
    priority_level VARCHAR(20) NOT NULL DEFAULT 'ROUTINE',
    priority_score FLOAT NOT NULL DEFAULT 0.0,
    priority_reason VARCHAR(255),
    lesion_evidence_summary JSON,
    concordance_flags JSON,
    review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    thumbnail_preview TEXT,
    image_checksum VARCHAR(64) NOT NULL,
    capsule_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    full_image_synced BOOLEAN DEFAULT FALSE,
    full_image_synced_at TIMESTAMP WITH TIME ZONE,
    raw_capsule_payload JSON
);

CREATE INDEX IF NOT EXISTS ix_evidence_capsules_screening_id ON evidence_capsules(screening_id);
CREATE INDEX IF NOT EXISTS ix_evidence_capsules_case_number ON evidence_capsules(case_number);
CREATE INDEX IF NOT EXISTS ix_evidence_capsules_patient_ref_id ON evidence_capsules(patient_ref_id);

-- 3. Create Priority-Aware Synchronization Queue Records table (Feature 32 & 34)
CREATE TABLE IF NOT EXISTS sync_queue_records (
    id UUID PRIMARY KEY,
    screening_id UUID NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    sync_type VARCHAR(50) NOT NULL DEFAULT 'CAPSULE',
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    priority_level VARCHAR(20) NOT NULL DEFAULT 'ROUTINE',
    priority_score FLOAT NOT NULL DEFAULT 0.0,
    transport_priority FLOAT NOT NULL DEFAULT 0.0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    last_error TEXT,
    payload_size_bytes INTEGER DEFAULT 0,
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_sync_queue_records_screening_id ON sync_queue_records(screening_id);
CREATE INDEX IF NOT EXISTS ix_sync_queue_records_idempotency_key ON sync_queue_records(idempotency_key);
CREATE INDEX IF NOT EXISTS ix_sync_queue_records_status ON sync_queue_records(status);

