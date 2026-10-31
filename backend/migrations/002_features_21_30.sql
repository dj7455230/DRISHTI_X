-- DRISHTI-X — Migration: Features 21–30
-- Priority Management, Review Action History, Analysis Jobs, Case Management

-- 1. Add priority fields and unique case_number to screenings
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS priority_level VARCHAR(20) DEFAULT 'ROUTINE';
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS priority_score FLOAT DEFAULT 0.0;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS priority_factors JSONB;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS priority_rule_version VARCHAR(20) DEFAULT '1.0.0';
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS priority_calculated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS case_number VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS ix_screenings_case_number ON screenings (case_number);
CREATE INDEX IF NOT EXISTS ix_screenings_priority_score ON screenings (priority_score DESC);

-- 2. Create doctor_review_actions table (Features 23 & 24)
CREATE TABLE IF NOT EXISTS doctor_review_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id UUID NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL, -- ACCEPT | REVIEW_FURTHER | REFER | RECAPTURE
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    doctor_grade INTEGER,
    doctor_grade_label VARCHAR(50),
    notes TEXT,
    referral_destination VARCHAR(255),
    referral_urgency VARCHAR(50),
    follow_up_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_doctor_review_actions_screening_id ON doctor_review_actions (screening_id);
CREATE INDEX IF NOT EXISTS ix_doctor_review_actions_reviewer_id ON doctor_review_actions (reviewer_id);

-- 3. Create analysis_jobs table (Features 27 & 29)
CREATE TABLE IF NOT EXISTS analysis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_id UUID NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    engine VARCHAR(50) DEFAULT 'PYTHON_EFFICIENTNET' NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    stage VARCHAR(50) DEFAULT 'IMAGE_UPLOADING' NOT NULL,
    progress_percent FLOAT DEFAULT 0.0,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    execution_time_seconds FLOAT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_code VARCHAR(100),
    error_message TEXT,
    error_details JSONB,
    result_summary JSONB
);
CREATE INDEX IF NOT EXISTS ix_analysis_jobs_screening_id ON analysis_jobs (screening_id);
CREATE INDEX IF NOT EXISTS ix_analysis_jobs_status ON analysis_jobs (status);

