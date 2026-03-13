from contextlib import contextmanager
from typing import Iterator

from psycopg import Connection, connect
from psycopg.rows import dict_row

from api.config import get_settings


@contextmanager
def get_db_connection() -> Iterator[Connection]:
    settings = get_settings()
    with connect(settings.workflow_database_url, row_factory=dict_row) as connection:
        yield connection
