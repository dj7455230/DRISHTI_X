"""
DRISHTI-X — Priority-Aware Synchronization Service (Feature 32 & 34)
Implements priority-based scheduling, aging fairness, idempotency enforcement,
chunked image assembly, and synchronization audit tracking for rural PHCs.
"""
import os
import io
import shutil
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.screening import (
    Screening, FundusImage, EvidenceCapsule, SyncQueueRecord, ScreeningStatus
)
from app.models.patient import Patient
from app.models.user import User


# Priority base weighting for technical transport
PRIORITY_BASE_WEIGHTS = {
    "CRITICAL": 100.0,
    "HIGH": 75.0,
    "MEDIUM": 50.0,
    "ROUTINE": 25.0,
}

# Maximum fairness aging bonus to prevent routine case starvation
MAX_AGING_BONUS = 30.0
AGING_RATE_PER_MINUTE = 0.5 # Adds 0.5 points per minute waiting


class PrioritySyncService:
    """
    Manages priority-aware upload ordering, idempotency, chunked assembly,
    and sync queue scheduling.
    """

    @classmethod
    def calculate_transport_priority(
        cls,
        priority_level: str,
        priority_score: float,
        queued_at: datetime,
        now: Optional[datetime] = None,
    ) -> float:
        """
        Computes effective transport priority.
        Separates clinical urgency from technical transport order while ensuring
        routine cases gain priority over time so they are never starved indefinitely.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        # Normalize queued_at to timezone-aware UTC
        if queued_at.tzinfo is None:
            queued_at = queued_at.replace(tzinfo=timezone.utc)

        elapsed_seconds = max(0.0, (now - queued_at).total_seconds())
        elapsed_minutes = elapsed_seconds / 60.0

        base_weight = PRIORITY_BASE_WEIGHTS.get(priority_level.upper(), 25.0)
        clinical_factor = (priority_score / 100.0) * 20.0 # 0 to 20 pts
        aging_bonus = min(MAX_AGING_BONUS, elapsed_minutes * AGING_RATE_PER_MINUTE)

        transport_priority = base_weight + clinical_factor + aging_bonus
        return round(transport_priority, 2)

    @classmethod
    def register_or_get_sync_record(
        cls,
        db: Session,
        screening_id: Any,
        idempotency_key: str,
        sync_type: str = "CAPSULE",
        priority_level: str = "ROUTINE",
        priority_score: float = 0.0,
        payload_size_bytes: int = 0,
    ) -> Tuple[SyncQueueRecord, bool]:
        """
        Idempotent sync queue registration.
        Returns (SyncQueueRecord, is_newly_created).
        """
        existing = db.query(SyncQueueRecord).filter(
            SyncQueueRecord.idempotency_key == idempotency_key
        ).first()

        if existing:
            return existing, False

        now = datetime.now(timezone.utc)
        transport_pri = cls.calculate_transport_priority(
            priority_level=priority_level,
            priority_score=priority_score,
            queued_at=now,
            now=now,
        )

        record = SyncQueueRecord(
            screening_id=screening_id,
            idempotency_key=idempotency_key,
            sync_type=sync_type,
            status="QUEUED",
            priority_level=priority_level,
            priority_score=priority_score,
            transport_priority=transport_pri,
            payload_size_bytes=payload_size_bytes,
            queued_at=now,
        )
        db.add(record)
        db.flush()
        return record, True

    @classmethod
    def get_prioritized_sync_queue(
        cls,
        db: Session,
        status: Optional[str] = "QUEUED",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Retrieves the sync queue ordered strictly by transport priority (descending),
        ensuring CRITICAL and HIGH cases are served before ROUTINE cases.
        """
        query = db.query(SyncQueueRecord)
        if status:
            query = query.filter(SyncQueueRecord.status == status)

        records = query.all()
        now = datetime.now(timezone.utc)

        # Recalculate dynamic transport priority with aging bonus
        queue_items = []
        for r in records:
            dynamic_pri = cls.calculate_transport_priority(
                priority_level=r.priority_level,
                priority_score=r.priority_score,
                queued_at=r.queued_at,
                now=now,
            )
            # Update record in DB
            r.transport_priority = dynamic_pri
            queue_items.append({
                "id": str(r.id),
                "screening_id": str(r.screening_id),
                "idempotency_key": r.idempotency_key,
                "sync_type": r.sync_type,
                "status": r.status,
                "priority_level": r.priority_level,
                "priority_score": r.priority_score,
                "transport_priority": dynamic_pri,
                "retry_count": r.retry_count,
                "payload_size_bytes": r.payload_size_bytes,
                "queued_at": r.queued_at.isoformat() if r.queued_at else None,
            })

        db.commit()
        # Sort descending by transport_priority
        queue_items.sort(key=lambda x: x["transport_priority"], reverse=True)
        return queue_items[:limit]

    @classmethod
    def assemble_chunked_upload(
        cls,
        case_id: str,
        chunk_index: int,
        total_chunks: int,
        chunk_bytes: bytes,
        chunk_dir_root: str,
    ) -> Tuple[bool, Optional[bytes], str]:
        """
        Saves a chunk to disk. When all chunks [0 .. total_chunks-1] are present,
        assembles the complete binary and cleans up chunk files.
        Returns (is_complete, complete_bytes_or_none, message).
        """
        case_chunk_dir = os.path.join(chunk_dir_root, "chunks", str(case_id))
        os.makedirs(case_chunk_dir, exist_ok=True)

        chunk_path = os.path.join(case_chunk_dir, f"chunk_{chunk_index:04d}.part")
        with open(chunk_path, "wb") as f:
            f.write(chunk_bytes)

        # Check if all chunks exist
        existing_chunks = os.listdir(case_chunk_dir)
        if len(existing_chunks) < total_chunks:
            return False, None, f"Chunk {chunk_index + 1}/{total_chunks} received."

        # All chunks arrived -> concatenate in order
        assembled = io.BytesIO()
        for idx in range(total_chunks):
            p = os.path.join(case_chunk_dir, f"chunk_{idx:04d}.part")
            if not os.path.exists(p):
                return False, None, f"Missing chunk {idx} during assembly."
            with open(p, "rb") as cf:
                assembled.write(cf.read())

        complete_bytes = assembled.getvalue()
        # Clean up temporary chunks
        try:
            shutil.rmtree(case_chunk_dir)
        except Exception:
            pass

        return True, complete_bytes, f"All {total_chunks} chunks assembled successfully."

