$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
Set-Location $backendDir

if (-not (Test-Path ".venv\Scripts\Activate.ps1")) {
    throw ".venv\\Scripts\\Activate.ps1 was not found. Create the virtual environment first."
}

. ".venv\Scripts\Activate.ps1"
python -m uvicorn main:app --host 0.0.0.0 --port 8000
