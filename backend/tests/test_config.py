from __future__ import annotations

import importlib
from pathlib import Path


def test_config_loads_env_and_creates_directories(monkeypatch, workspace_tmp_path):
    upload_dir = workspace_tmp_path / "uploads"
    output_dir = workspace_tmp_path / "outputs"
    template_dir = workspace_tmp_path / "templates"

    monkeypatch.setenv("UPLOAD_DIR", str(upload_dir))
    monkeypatch.setenv("OUTPUT_DIR", str(output_dir))
    monkeypatch.setenv("TEMPLATE_DIR", str(template_dir))
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173, http://127.0.0.1:5173")
    monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
    monkeypatch.setenv("GOOGLE_MODEL", "test-model")

    import app.core.config as config

    config = importlib.reload(config)

    assert config.UPLOAD_DIR == upload_dir
    assert config.OUTPUT_DIR == output_dir
    assert config.TEMPLATE_DIR == template_dir
    assert config.CORS_ORIGINS == ["http://localhost:5173", "http://127.0.0.1:5173"]
    assert config.GOOGLE_API_KEY == "test-key"
    assert config.GOOGLE_MODEL == "test-model"
    assert config.UPLOAD_DIR.is_dir()
    assert config.OUTPUT_DIR.is_dir()
    assert config.TEMPLATE_DIR.is_dir()


def test_config_resolves_relative_env_paths_from_backend_base(monkeypatch, workspace_tmp_path):
    relative_upload_dir = Path("relative") / "uploads"
    relative_output_dir = Path("relative") / "outputs"
    relative_template_dir = Path("relative") / "templates"

    monkeypatch.setenv("UPLOAD_DIR", str(relative_upload_dir))
    monkeypatch.setenv("OUTPUT_DIR", str(relative_output_dir))
    monkeypatch.setenv("TEMPLATE_DIR", str(relative_template_dir))

    import app.core.config as config

    config = importlib.reload(config)

    assert config.UPLOAD_DIR == (config.BASE_DIR / relative_upload_dir).resolve()
    assert config.OUTPUT_DIR == (config.BASE_DIR / relative_output_dir).resolve()
    assert config.TEMPLATE_DIR == (config.BASE_DIR / relative_template_dir).resolve()
