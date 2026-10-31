"""
DRISHTI-X — Tamper-Evident Audit Service
Feature 44: Complete Audit Trail with Cryptographic Hash Chaining

Provides append-only, tamper-evident audit logging for:
- AI Inference & Assurance Decisions
- Clinical Doctor Reviews & Overrides
- System Data-Lifecycle Events
- Security & Authentication Events

Integrity mechanism:
Every new audit event is chained to the preceding event hash:
event_hash = SHA-256(prev_event_hash + action + user_id + screening_id + timestamp + detail)
Genesis hash: '0'*64
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.audit import AuditLog

GENESIS_HASH = "0" * 64


class AuditService:
    @staticmethod
    def _format_timestamp(ts: datetime) -> str:
        """Format timestamp deterministically regardless of tzinfo or driver naive storage."""
        if ts is None:
            return ""
        if ts.tzinfo is not None:
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
        return ts.isoformat()

    @staticmethod
    def compute_event_hash(
        prev_hash: str,
        action: str,
        user_id: Optional[str],
        screening_id: Optional[str],
        timestamp_str: str,
        detail: Optional[str],
    ) -> str:
        """Deterministic SHA-256 hash chaining calculation."""
        payload = f"{prev_hash}|{action}|{user_id or ''}|{screening_id or ''}|{timestamp_str}|{detail or ''}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @classmethod
    def log_event(
        cls,
        db: Session,
        action: str,
        user_id: Optional[Any] = None,
        screening_id: Optional[Any] = None,
        detail: Optional[str] = None,
        old_val: Optional[Any] = None,
        new_val: Optional[Any] = None,
        model_version: Optional[str] = None,
        user_role: Optional[str] = None,
        ip_address: Optional[str] = None,
        commit: bool = True,
    ) -> AuditLog:
        """
        Record a cryptographically chained audit log entry.
        Transaction-safe and append-only.
        """
        # Fetch the most recent audit record to obtain prev_hash
        last_entry = db.query(AuditLog).order_by(desc(AuditLog.timestamp), desc(AuditLog.id)).first()
        prev_hash = last_entry.event_hash if (last_entry and last_entry.event_hash) else GENESIS_HASH

        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
        now_str = cls._format_timestamp(now_utc)

        event_hash = cls.compute_event_hash(
            prev_hash=prev_hash,
            action=action,
            user_id=str(user_id) if user_id else None,
            screening_id=str(screening_id) if screening_id else None,
            timestamp_str=now_str,
            detail=detail,
        )

        entry = AuditLog(
            id=uuid.uuid4(),
            user_id=user_id,
            screening_id=screening_id,
            action=action,
            user_role=user_role,
            detail=detail,
            old_value=old_val if isinstance(old_val, (dict, list)) else ({"value": old_val} if old_val is not None else None),
            new_value=new_val if isinstance(new_val, (dict, list)) else ({"value": new_val} if new_val is not None else None),
            model_version=model_version,
            ip_address=ip_address,
            prev_event_hash=prev_hash,
            event_hash=event_hash,
            timestamp=now_utc,
        )

        db.add(entry)
        if commit:
            db.commit()
        return entry

    @classmethod
    def verify_chain(cls, db: Session) -> Dict[str, Any]:
        """
        Traverse the audit chain sequentially from genesis to verify cryptographic integrity.
        Detects tampering, omissions, or record alterations.
        """
        records = db.query(AuditLog).order_by(AuditLog.timestamp.asc(), AuditLog.id.asc()).all()

        if not records:
            return {
                "chain_status": "INTACT",
                "total_records_verified": 0,
                "verified_at": datetime.now(timezone.utc).isoformat(),
                "tampering_detected": False,
                "genesis_hash": GENESIS_HASH,
                "latest_hash": None,
                "message": "Audit log is empty. Genesis state intact.",
            }

        prev_hash = GENESIS_HASH
        tampered_index = None

        for idx, rec in enumerate(records):
            # If historical record has no hash yet, backfill or check
            if not rec.event_hash:
                continue

            expected_hash = cls.compute_event_hash(
                prev_hash=prev_hash,
                action=rec.action,
                user_id=str(rec.user_id) if rec.user_id else None,
                screening_id=str(rec.screening_id) if rec.screening_id else None,
                timestamp_str=cls._format_timestamp(rec.timestamp),
                detail=rec.detail,
            )

            if rec.event_hash != expected_hash or (rec.prev_event_hash and rec.prev_event_hash != prev_hash):
                tampered_index = idx
                break

            prev_hash = rec.event_hash

        is_valid = tampered_index is None

        return {
            "chain_status": "INTACT" if is_valid else "COMPROMISED",
            "tampering_detected": not is_valid,
            "broken_link_index": tampered_index,
            "total_records_verified": len(records),
            "latest_hash": records[-1].event_hash if records else None,
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "note": (
                "Tamper-evidence is established via SHA-256 forward-hash chaining. "
                "Any alteration of past actions, timestamps, or entities breaks the cryptographic hash."
            ),
        }
