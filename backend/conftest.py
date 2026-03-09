"""
Root conftest — sets required env vars before any app module is imported.
This file is intentionally at the backend/ root so pytest processes it
before tests/conftest.py, which imports from main/auth at module level.
"""

import os

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-pytest-do-not-use-in-production-xxxxxx")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/test")
