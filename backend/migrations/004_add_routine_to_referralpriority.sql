-- Migration 004: Add ROUTINE value to referralpriority enum
-- The Python enum ReferralPriority includes ROUTINE but PostgreSQL was missing it.
-- This caused a DataError (InvalidTextRepresentation) when analyzing screenings with
-- low referral priority (Grade 0 predictions default to "ROUTINE").

DO $$
BEGIN
    -- Check if ROUTINE already exists before adding
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'referralpriority' AND e.enumlabel = 'ROUTINE'
    ) THEN
        ALTER TYPE referralpriority ADD VALUE 'ROUTINE' BEFORE 'MEDIUM';
    END IF;
END $$;
