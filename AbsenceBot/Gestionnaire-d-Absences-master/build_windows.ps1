$ErrorActionPreference = "Stop"

python -m pip install -r requirements.txt
python -m playwright install chromium
python -m PyInstaller --noconfirm --clean app.spec

Write-Host "Build complete: dist\GestionnaireAbsences"