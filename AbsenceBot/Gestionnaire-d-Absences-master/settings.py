import json
import os
import sys
import tempfile


if getattr(sys, "frozen", False):
    APP_DIR = os.path.join(
        os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
        "GestionnaireAbsences",
    )
    RESOURCE_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
    RESOURCE_DIR = APP_DIR

SETTINGS_PATH = os.path.join(APP_DIR, "settings.json")
REQUIRED_KEYS = ("DB_NAME", "DB_USER", "DB_PASS", "DB_HOST", "CODE", "MDP")


def _config_path():
    return os.path.join(RESOURCE_DIR, "config.py")


def _load_config_file():
    config_path = _config_path()
    if not os.path.exists(config_path):
        return {}

    values = {}
    namespace = {}
    with open(config_path, "r", encoding="utf-8") as config_file:
        exec(compile(config_file.read(), config_path, "exec"), {}, namespace)
    for key in REQUIRED_KEYS:
        value = namespace.get(key)
        if value is not None:
            values[key] = str(value)
    return values


def load_settings():
    values = {}
    if os.path.exists(SETTINGS_PATH):
        with open(SETTINGS_PATH, "r", encoding="utf-8") as settings_file:
            loaded = json.load(settings_file)
        values.update({key: str(loaded.get(key, "")) for key in REQUIRED_KEYS})

    if not any(values.values()):
        values.update(_load_config_file())
    return {key: values.get(key, "") for key in REQUIRED_KEYS}


def save_settings(values):
    settings = {key: str(values.get(key, "")).strip() for key in REQUIRED_KEYS}
    missing = [key for key in REQUIRED_KEYS if not settings[key]]
    if missing:
        raise ValueError("Champs manquants : " + ", ".join(missing))

    os.makedirs(APP_DIR, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(prefix="settings-", suffix=".json", dir=APP_DIR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as settings_file:
            json.dump(settings, settings_file, ensure_ascii=True, indent=2)
        os.replace(temporary_path, SETTINGS_PATH)
    finally:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)

    return settings
