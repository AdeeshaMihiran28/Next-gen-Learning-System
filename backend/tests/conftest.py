from __future__ import annotations

import shutil
import sys
from uuid import uuid4
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(autouse=True)
def clear_job_store():
    from app.domain.jobs import JOB_STORE

    JOB_STORE.clear()
    yield
    JOB_STORE.clear()


@pytest.fixture
def workspace_tmp_path():
    tmp_dir = BACKEND_DIR / "data" / "_pytest_tmp" / uuid4().hex
    tmp_dir.mkdir(parents=True, exist_ok=True)
    yield tmp_dir
    shutil.rmtree(tmp_dir, ignore_errors=True)
