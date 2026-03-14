from __future__ import annotations

import json
import logging
import os
import random
import signal
import socket
from threading import Event
from typing import Any

import pika
from pika.adapters.blocking_connection import BlockingChannel, BlockingConnection

from api.config import Settings, get_settings
from api.db import get_db_connection


logger = logging.getLogger(__name__)


class RabbitPublisher:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.connection: BlockingConnection | None = None
        self.channel: BlockingChannel | None = None

    def ensure_channel(self) -> BlockingChannel:
        if self.channel is not None and self.connection is not None:
            if not self.channel.is_closed and not self.connection.is_closed:
                return self.channel

        self.close()
        self.connection = pika.BlockingConnection(
            pika.URLParameters(self.settings.rabbitmq_url),
        )
        self.channel = self.connection.channel()
        self.channel.exchange_declare(
            exchange=self.settings.outbox_exchange,
            exchange_type="topic",
            durable=True,
        )
        self.channel.confirm_delivery()
        return self.channel

    def close(self) -> None:
        if self.connection is None:
            return

        try:
            self.connection.close()
        except Exception:
            logger.debug("Ignored RabbitMQ close failure.", exc_info=True)
        finally:
            self.connection = None
            self.channel = None


def _worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def _backoff_seconds(retry_count: int) -> int:
    base = min(300, 2 ** min(max(retry_count - 1, 0), 8))
    return base + random.randint(0, max(1, base // 4))


def _claim_batch(settings: Settings, claimed_by: str) -> list[dict[str, Any]]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH candidates AS (
                    SELECT id
                    FROM outbox_event
                    WHERE (
                        status IN ('pending', 'retry_scheduled')
                        AND available_at <= now()
                    ) OR (
                        status = 'processing'
                        AND claimed_at <= now() - make_interval(secs => %s)
                    )
                    ORDER BY available_at, created_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT %s
                )
                UPDATE outbox_event AS event
                SET status = 'processing',
                    claimed_at = now(),
                    claimed_by = %s,
                    retry_count = event.retry_count + 1,
                    max_attempts = COALESCE(event.max_attempts, %s),
                    updated_at = now()
                FROM candidates
                WHERE event.id = candidates.id
                RETURNING
                    event.id,
                    event.aggregate_type,
                    event.aggregate_id,
                    event.event_type,
                    event.payload,
                    event.headers,
                    event.retry_count,
                    event.max_attempts;
                """,
                (
                    settings.outbox_claim_ttl_seconds,
                    settings.outbox_batch_size,
                    claimed_by,
                    settings.outbox_max_attempts_default,
                ),
            )
            rows = cursor.fetchall()
        connection.commit()

    return rows


def _mark_published(event_id: str, claimed_by: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE outbox_event
                SET status = 'published',
                    published_at = now(),
                    claimed_at = NULL,
                    claimed_by = NULL,
                    last_error = NULL,
                    last_error_at = NULL,
                    updated_at = now()
                WHERE id = %s AND claimed_by = %s
                """,
                (event_id, claimed_by),
            )
        connection.commit()


def _mark_failed(row: dict[str, Any], claimed_by: str, error: str) -> None:
    next_status = (
        "dead_letter" if row["retry_count"] >= row["max_attempts"] else "retry_scheduled"
    )
    delay_seconds = 0 if next_status == "dead_letter" else _backoff_seconds(row["retry_count"])

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE outbox_event
                SET status = %s,
                    available_at = CASE
                        WHEN %s = 'dead_letter' THEN available_at
                        ELSE now() + make_interval(secs => %s)
                    END,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    last_error = left(%s, 2000),
                    last_error_at = now(),
                    updated_at = now()
                WHERE id = %s AND claimed_by = %s
                """,
                (
                    next_status,
                    next_status,
                    delay_seconds,
                    error,
                    row["id"],
                    claimed_by,
                ),
            )
        connection.commit()


def _publish_row(channel: BlockingChannel, settings: Settings, row: dict[str, Any]) -> None:
    envelope = {
        "id": str(row["id"]),
        "eventType": row["event_type"],
        "aggregateType": row["aggregate_type"],
        "aggregateId": str(row["aggregate_id"]),
        "payload": row["payload"] or {},
    }
    headers = dict(row["headers"] or {})
    headers.setdefault("x-outbox-id", str(row["id"]))

    published = channel.basic_publish(
        exchange=settings.outbox_exchange,
        routing_key=row["event_type"],
        body=json.dumps(envelope).encode("utf-8"),
        mandatory=True,
        properties=pika.BasicProperties(
            content_type="application/json",
            content_encoding="utf-8",
            delivery_mode=2,
            message_id=str(row["id"]),
            type=row["event_type"],
            headers=headers,
        ),
    )
    if not published:
        raise RuntimeError(f"RabbitMQ did not confirm publish for outbox event {row['id']}.")


def _process_rows(
    settings: Settings,
    claimed_by: str,
    publisher: RabbitPublisher,
    rows: list[dict[str, Any]],
) -> int:
    published = 0

    for row in rows:
        try:
            channel = publisher.ensure_channel()
            _publish_row(channel, settings, row)
        except Exception as exc:
            logger.exception(
                "Failed to publish outbox event to RabbitMQ.",
                extra={
                    "event_id": str(row["id"]),
                    "event_type": row["event_type"],
                    "retry_count": row["retry_count"],
                },
            )
            try:
                _mark_failed(row, claimed_by, str(exc))
            except Exception:
                logger.exception(
                    "Failed to mark outbox event as retry_scheduled/dead_letter.",
                    extra={"event_id": str(row["id"])},
                )
            publisher.close()
            continue

        try:
            _mark_published(str(row["id"]), claimed_by)
            published += 1
        except Exception:
            logger.exception(
                "RabbitMQ publish succeeded but marking outbox event as published failed.",
                extra={"event_id": str(row["id"])},
            )

    return published


def run_once(settings: Settings | None = None, *, claimed_by: str | None = None) -> int:
    active_settings = settings or get_settings()
    active_claimed_by = claimed_by or _worker_id()
    publisher = RabbitPublisher(active_settings)

    try:
        rows = _claim_batch(active_settings, active_claimed_by)
        if not rows:
            return 0

        published = _process_rows(active_settings, active_claimed_by, publisher, rows)
        logger.info("Processed outbox batch.", extra={"published_count": published})
        return published
    finally:
        publisher.close()


def run_forever(settings: Settings | None = None) -> None:
    active_settings = settings or get_settings()
    active_claimed_by = _worker_id()
    publisher = RabbitPublisher(active_settings)
    stop_event = Event()

    def handle_signal(signum: int, _frame: Any) -> None:
        logger.info("Stopping outbox worker.", extra={"signal": signum})
        stop_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    logger.info(
        "Starting outbox worker.",
        extra={
            "worker_id": active_claimed_by,
            "batch_size": active_settings.outbox_batch_size,
            "poll_interval_seconds": active_settings.outbox_poll_interval_seconds,
        },
    )

    try:
        while not stop_event.is_set():
            try:
                rows = _claim_batch(active_settings, active_claimed_by)
                if not rows:
                    stop_event.wait(active_settings.outbox_poll_interval_seconds)
                    continue

                published = _process_rows(active_settings, active_claimed_by, publisher, rows)
                logger.info(
                    "Processed outbox batch.",
                    extra={"published_count": published, "worker_id": active_claimed_by},
                )
            except Exception:
                logger.exception("Outbox worker iteration failed.")
                publisher.close()
                if stop_event.wait(active_settings.outbox_poll_interval_seconds):
                    break
    finally:
        publisher.close()
