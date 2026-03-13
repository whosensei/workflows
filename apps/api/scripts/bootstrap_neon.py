from pathlib import Path

from psycopg import connect

from api.config import get_settings


def main() -> None:
    settings = get_settings()
    sql_path = (
        Path(__file__).resolve().parents[3] / "infra" / "postgres" / "init" / "01_foundation.sql"
    )
    sql = sql_path.read_text(encoding="utf-8")

    with connect(settings.workflow_database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql)

    print(f"Applied foundation schema to Neon using {sql_path}.")


if __name__ == "__main__":
    main()
