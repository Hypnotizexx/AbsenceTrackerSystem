# Gestionnaire d'Absences

## Build on Windows 11

Requirements:

From a fresh clone, open PowerShell in the project folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\build_windows.ps1
```

The script installs the Python dependencies, downloads the Playwright Chromium browser, and runs PyInstaller. The result is created here:

```text
dist\GestionnaireAbsences\
```

Distribute the complete folder. Start the application with:

```text
dist\GestionnaireAbsences\GestionnaireAbsences.exe
```

Do not distribute only the executable. The `_internal` folder contains required Python libraries, Flask files, and Chromium.

## First launch

The target computer needs the Microsoft Edge WebView2 Runtime and internet access to the PostgreSQL database and CPGE website.

On first launch, open the settings gear, enter the six connection fields, and save them. The credentials are stored in:

```text
%LOCALAPPDATA%\GestionnaireAbsences\settings.json
```

Each user or computer has its own settings file. `config.py` is not required.

## Source mode

To run without PyInstaller:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium
python app.py
```

## Build files

- `requirements.txt`: Python and build dependencies
- `app.spec`: PyInstaller packaging configuration
- `build_windows.ps1`: one-command Windows build
