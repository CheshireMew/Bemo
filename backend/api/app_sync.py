from typing import Any
from fastapi import APIRouter
from pydantic import BaseModel
from services import app_sync_service

router = APIRouter()


class ReplicaRead(BaseModel):
    operation_ids: list[str] = []


@router.post("/replica/read")
def read_replica(payload: ReplicaRead):
    return app_sync_service.read_replica(payload.operation_ids)


@router.post("/replica/commit")
def commit_replica(payload: dict[str, Any]):
    return app_sync_service.commit_replica(payload)


@router.get("/outbox")
def list_outbox(target: str):
    return app_sync_service.list_outbox(target)


@router.delete("/outbox/{operation_id}")
def acknowledge_outbox(operation_id: str):
    app_sync_service.acknowledge_outbox(operation_id)
    return {"ok": True}
