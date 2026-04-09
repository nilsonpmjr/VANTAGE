"""Central logging configuration."""

import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler


def setup_logging(
    level: str = "INFO",
    log_file: Path = None,
    console: bool = True
):
    """Configure application logging."""
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    formatter = logging.Formatter(log_format, date_format)

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))

    root_logger.handlers = []

    if console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)

    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5
        )
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    # Keep dependency logging readable by default.
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)

    logger = logging.getLogger(__name__)
    logger.debug(f"Logging initialized at {level} level")


def get_logger(name: str) -> logging.Logger:
    """Return a configured logger for the given module name."""
    return logging.getLogger(name)
