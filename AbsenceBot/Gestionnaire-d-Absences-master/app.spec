import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

project_dir = Path(SPECPATH)
playwright_dir = Path(__import__("playwright").__file__).parent
browser_dir = Path(
    os.environ.get(
        "PLAYWRIGHT_BROWSERS_PATH",
        Path.home() / "AppData" / "Local" / "ms-playwright",
    )
)

datas = [
    (str(project_dir / "templates"), "templates"),
    (str(project_dir / "static"), "static"),
    (str(browser_dir), "ms-playwright"),
]

hiddenimports = collect_submodules("webview")

a = Analysis(
    [str(project_dir / "app.py")],
    pathex=[str(project_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    name="GestionnaireAbsences",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    name="GestionnaireAbsences",
)