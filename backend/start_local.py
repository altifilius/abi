"""Start the migrated production build on loopback; no external services are created."""

import os

from .settings import settings


def main() -> None:
    if settings.ocr_data_path is not None:
        os.environ["TESSDATA_PREFIX"] = str(settings.ocr_data_path)
    from .main import run

    run()


if __name__ == "__main__":
    main()
