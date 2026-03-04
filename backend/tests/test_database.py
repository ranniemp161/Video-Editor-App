import os
import pytest
from unittest.mock import patch

def test_database_url_from_env(monkeypatch):
    """Test that DATABASE_URL environment variable overrides SQLite URL."""
    # Set fake env var
    fake_url = "sqlite:///fake_test_db.db"
    monkeypatch.setenv("DATABASE_URL", fake_url)
    
    # We must reload the module to see the effect from env block at top level
    import importlib
    import db.database
    importlib.reload(db.database)
    
    from db.database import SQLALCHEMY_DATABASE_URL, engine
    assert SQLALCHEMY_DATABASE_URL == fake_url
    assert str(engine.url) == fake_url

def test_data_dir_from_env(monkeypatch):
    """Test that DATA_DIR environment variable is respected."""
    import tempfile
    with tempfile.TemporaryDirectory() as temp_dir:
        monkeypatch.setenv("DATA_DIR", temp_dir)
        
        # Reload to apply env var
        import importlib
        import db.database
        importlib.reload(db.database)
        
        from db.database import DATA_DIR
        assert DATA_DIR == temp_dir
        assert os.path.exists(temp_dir)

def test_permission_error_fallback(monkeypatch):
    """Test that a PermissionError triggers the fallback directory."""
    
    # Mock os.makedirs to raise PermissionError on the first call (default data dir)
    original_makedirs = os.makedirs
    
    def mock_makedirs(name, mode=0o777, exist_ok=False):
        import db.database
        if name == db.database.default_data_dir:
            raise PermissionError(f"[Errno 13] Permission denied: '{name}'")
        return original_makedirs(name, mode, exist_ok)

    with patch('os.makedirs', side_effect=mock_makedirs):
        # We also need to make sure DATA_DIR isn't set in environment
        monkeypatch.delenv("DATA_DIR", raising=False)
        monkeypatch.delenv("DATABASE_URL", raising=False)
        
        import importlib
        import db.database
        importlib.reload(db.database)
        
        from db.database import DATA_DIR, fallback_data_dir
        
        # Check that DATA_DIR ended up being the fallback_data_dir
        assert DATA_DIR == fallback_data_dir
