from __future__ import annotations

import logging

from api.outbox_worker import run_once


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    published = run_once()
    print(f"Published {published} outbox events to RabbitMQ.")


if __name__ == "__main__":
    main()
