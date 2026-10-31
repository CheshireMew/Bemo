from typing import Any
from fastapi import APIRouter
from pydantic import BaseModel
from services import app_sync_service

router = APIRouter()


class ReplicaRead(BaseModel):
    operation_ids: list[str] = []
    target_id: str | None = None


@router.get('/change-token')
def app_change_token():
    from services.sync_service import get_sync_info
    return get_sync_info()


@router.post("/replica/read")
def read_replica(payload: ReplicaRead):
    return app_sync_service.read_replica(payload.operation_ids, payload.target_id)


@router.post("/replica/commit")
def commit_replica(payload: dict[str, Any]):
    return app_sync_service.commit_replica(payload)


@router.post("/replica/receipts")
def record_receipts(payload: dict[str, Any]):
    return app_sync_service.record_receipts(payload.get('receipts', {}))


@router.get("/outbox")
def list_outbox(target: str, target_id: str | None = None):
    return app_sync_service.list_outbox(target, target_id)


@router.post("/outbox/claim")
def claim_outbox(payload: dict[str, str]):
    app_sync_service.claim_legacy_target(payload['target'], payload['target_id'])
    return {"ok": True}


@router.get("/sync-state/{key:path}")
def read_sync_state(key: str):
    return app_sync_service.read_sync_state(key)


@router.get("/sync-states")
def list_sync_states(prefix: str):
    return app_sync_service.list_sync_state(prefix)


@router.put("/sync-state/{key:path}")
def write_sync_state(key: str, payload: dict[str, str]):
    return app_sync_service.write_sync_state(key, payload['value'])


@router.delete("/sync-state/{key:path}")
def remove_sync_state(key: str):
    return app_sync_service.write_sync_state(key, None)


@router.delete("/outbox/{operation_id}")
def acknowledge_outbox(operation_id: str):
    app_sync_service.acknowledge_outbox(operation_id)
    return {"ok": True}
