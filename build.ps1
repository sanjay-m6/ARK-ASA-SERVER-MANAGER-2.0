# Tauri Build Script with Signing
# Use this to build your application locally with the correct signing keys.

$action = Read-Host "Enter action (build/dev) [build]"
if ($action -eq "") { $action = "build" }

# Check for keys in environment or prompt
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    Write-Host "TAURI_SIGNING_PRIVATE_KEY not found in environment." -ForegroundColor Yellow
    $keyPath = "keys_ps_2.txt" # Common path seen in your project
    if (Test-Path $keyPath) {
        Write-Host "Loading key from $keyPath..."
        $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyPath -Raw
    }
    else {
        $env:TAURI_SIGNING_PRIVATE_KEY = Read-Host "Please paste your TAURI_SIGNING_PRIVATE_KEY"
    }
}

if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Read-Host "Please enter your TAURI_SIGNING_PRIVATE_KEY_PASSWORD (leave blank if none)"
}

Write-Host "Starting Tauri $action..." -ForegroundColor Cyan
if ($action -eq "build") {
    npm run tauri build
}
else {
    npm run tauri dev
}
