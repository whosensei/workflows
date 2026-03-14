from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from psycopg import connect, sql

from api.auth import AuthenticatedUser, get_current_user
from api.config import Settings, get_settings


router = APIRouter(tags=["realtime"])


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def publish_realtime_event(
    cursor,
    event_type: str,
    channels: list[str],
    *,
    users: list[str] | None = None,
    workflow_instance_id: str | None = None,
    notification_id: str | None = None,
    broadcast: bool = False,
) -> None:
    payload = {
        "id": str(uuid4()),
        "type": event_type,
        "channels": channels,
        "users": sorted(set(users or [])),
        "broadcast": broadcast,
        "workflowInstanceId": workflow_instance_id,
        "notificationId": notification_id,
        "occurredAt": _now_iso(),
    }
    cursor.execute(
        "SELECT pg_notify(%s, %s)",
        (
            get_settings().realtime_channel,
            json.dumps(payload, separators=(",", ":"), sort_keys=True),
        ),
    )


def _can_deliver_event(event_payload: dict[str, Any], user: AuthenticatedUser) -> bool:
    if bool(event_payload.get("broadcast")):
        return True

    users = event_payload.get("users")
    return isinstance(users, list) and user.user_id in users


def _encode_sse(event_name: str, payload: dict[str, Any]) -> str:
    lines = [
        f"event: {event_name}",
        f"id: {payload.get('id', str(uuid4()))}",
        f"data: {json.dumps(payload, separators=(',', ':'))}",
        "",
        "",
    ]
    return "\n".join(lines)


def _stream_user_events(user: AuthenticatedUser, settings: Settings):
    listen_dsn = settings.realtime_database_url or settings.workflow_database_url

    with connect(listen_dsn, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                sql.SQL("LISTEN {}").format(sql.Identifier(settings.realtime_channel))
            )

        yield _encode_sse(
            "connected",
            {
                "id": str(uuid4()),
                "type": "realtime.connected",
                "channels": [],
                "users": [user.user_id],
                "broadcast": False,
                "occurredAt": _now_iso(),
            },
        )

        while True:
            notifications = list(
                connection.notifies(
                    timeout=settings.realtime_heartbeat_seconds,
                    stop_after=1,
                )
            )
            if not notifications:
                yield ": keepalive\n\n"
                continue

            notification = notifications[0]
            try:
                payload = json.loads(notification.payload)
            except json.JSONDecodeError:
                continue

            if not isinstance(payload, dict) or not _can_deliver_event(payload, user):
                continue

            yield _encode_sse("realtime", payload)


@router.get("/api/v1/events")
def stream_events(
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    return StreamingResponse(
        _stream_user_events(user, settings),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
