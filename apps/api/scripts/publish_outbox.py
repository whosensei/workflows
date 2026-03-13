from __future__ import annotations

import json

import pika

from api.config import get_settings
from api.db import get_db_connection


def main() -> None:
    settings = get_settings()
    published = 0

    rabbitmq = pika.BlockingConnection(pika.URLParameters(settings.rabbitmq_url))
    channel = rabbitmq.channel()
    channel.exchange_declare(exchange="workflow.events", exchange_type="topic", durable=True)

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, event_type, payload
                FROM outbox_event
                WHERE status = 'pending' AND available_at <= now()
                ORDER BY created_at
                LIMIT 100
                """
            )
            rows = cursor.fetchall()

            for row in rows:
                channel.basic_publish(
                    exchange="workflow.events",
                    routing_key=row["event_type"],
                    body=json.dumps(row["payload"] or {}).encode("utf-8"),
                    properties=pika.BasicProperties(
                        content_type="application/json",
                        delivery_mode=2,
                        headers={"event_id": str(row["id"])},
                    ),
                )
                cursor.execute(
                    """
                    UPDATE outbox_event
                    SET status = 'published', published_at = now()
                    WHERE id = %s
                    """,
                    (row["id"],),
                )
                published += 1

        connection.commit()

    rabbitmq.close()
    print(f"Published {published} outbox events to RabbitMQ.")


if __name__ == "__main__":
    main()
