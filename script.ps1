# Views Asset Manager - Installation Script
# PowerShell installation script

# Set window title
$host.UI.RawUI.WindowTitle = "Views Asset Manager - Installation"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Views Asset Manager - Installation" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Stop After Effects if running
try {
    $aeProcess = Get-Process -Name "AfterFX" -ErrorAction SilentlyContinue
    if ($aeProcess) {
        Stop-Process -Name "AfterFX" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
} catch {
    # Ignore errors
}

# Set paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionSource = Join-Path $scriptDir "ViewsAssetManager"
$cepDir = "C:\Program Files (x86)\Common Files\Adobe\CEP\extensions"
$extensionDest = Join-Path $cepDir "ViewsAssetManager"

# Step 1: Create CEP extensions directory
Write-Host "[1/3] Creating CEP extensions directory..." -ForegroundColor Yellow

if (-not (Test-Path $cepDir)) {
    try {
        New-Item -ItemType Directory -Force -Path $cepDir | Out-Null
        Write-Host "      Done!" -ForegroundColor Green
    } catch {
        Write-Host ""
        Write-Host "[ERROR] Failed to create directory: $cepDir" -ForegroundColor Red
        Write-Host "Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
} else {
    Write-Host "      Done!" -ForegroundColor Green
}
Write-Host ""

# Check if extension already exists
if (Test-Path $extensionDest) {
    Write-Host ""
    Write-Host "Extension is already installed!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "What would you like to do?" -ForegroundColor Cyan
    Write-Host "  [R] Reinstall (update to latest version)" -ForegroundColor White
    Write-Host "  [U] Uninstall (remove extension)" -ForegroundColor White
    Write-Host "  [C] Cancel" -ForegroundColor White
    Write-Host ""
    Write-Host "Enter your choice (R/U/C): " -ForegroundColor Yellow -NoNewline
    
    $choice = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    $choiceChar = $choice.Character.ToString().ToUpper()
    Write-Host $choiceChar
    Write-Host ""
    
    if ($choiceChar -eq "U") {
        # Uninstall
        Write-Host "Uninstalling extension..." -ForegroundColor Yellow
        try {
            Remove-Item -Path $extensionDest -Recurse -Force -ErrorAction Stop
            Write-Host "      Done!" -ForegroundColor Green
            Write-Host ""
            Write-Host "============================================" -ForegroundColor Cyan
            Write-Host "  Uninstall Complete!" -ForegroundColor Cyan
            Write-Host "============================================" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "The extension has been removed successfully." -ForegroundColor White
            Write-Host ""
            Write-Host "Press any key to exit..." -ForegroundColor Gray
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            exit 0
        } catch {
            Write-Host ""
            Write-Host "[ERROR] Failed to uninstall extension" -ForegroundColor Red
            Write-Host "Error: $_" -ForegroundColor Red
            Write-Host ""
            Write-Host "Press any key to exit..."
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            exit 1
        }
    } elseif ($choiceChar -eq "C") {
        # Cancel
        Write-Host "Installation cancelled." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Press any key to exit..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 0
    } elseif ($choiceChar -ne "R") {
        # Invalid choice
        Write-Host "Invalid choice. Installation cancelled." -ForegroundColor Red
        Write-Host ""
        Write-Host "Press any key to exit..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 0
    }
    
    # Continue with reinstall (R was chosen)
    Write-Host "Reinstalling extension..." -ForegroundColor Yellow
    Write-Host ""
}

# Step 2: Copy extension files
Write-Host "[2/3] Installing extension files..." -ForegroundColor Yellow

if (-not (Test-Path $extensionSource)) {
    Write-Host ""
    Write-Host "[ERROR] ViewsAssetManager folder not found!" -ForegroundColor Red
    Write-Host "Make sure this script is in the same folder as ViewsAssetManager" -ForegroundColor Red
    Write-Host ""
    Write-Host "Script location: $scriptDir" -ForegroundColor Gray
    Write-Host "Looking for: $extensionSource" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Remove old version if exists
if (Test-Path $extensionDest) {
    try {
        Remove-Item -Path $extensionDest -Recurse -Force -ErrorAction Stop
    } catch {
        # Ignore errors
    }
}

# Copy extension
try {
    Copy-Item -Path $extensionSource -Destination $extensionDest -Recurse -Force -ErrorAction Stop
    Write-Host "      Done!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "[ERROR] Failed to copy extension files" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
Write-Host ""

# Step 3: Enable PlayerDebugMode in registry
Write-Host "[3/3] Enabling CEP debug mode..." -ForegroundColor Yellow

try {
    # Enable for CEP 10 (AE 2020)
    $regPath10 = "HKCU:\Software\Adobe\CSXS.10"
    if (-not (Test-Path $regPath10)) {
        New-Item -Path $regPath10 -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath10 -Name "PlayerDebugMode" -Value "1" -Type String -Force

    # Enable for CEP 11 (AE 2021-2025)
    $regPath11 = "HKCU:\Software\Adobe\CSXS.11"
    if (-not (Test-Path $regPath11)) {
        New-Item -Path $regPath11 -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath11 -Name "PlayerDebugMode" -Value "1" -Type String -Force

    Write-Host "      Done!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "[WARNING] Failed to set registry keys" -ForegroundColor Yellow
    Write-Host "Error: $_" -ForegroundColor Yellow
    Write-Host "Extension may still work, but debug mode is not enabled." -ForegroundColor Yellow
}
Write-Host ""

# Success!
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The Views Asset Manager extension has been" -ForegroundColor White
Write-Host "installed successfully!" -ForegroundColor White
Write-Host ""
Write-Host "To use the extension:" -ForegroundColor Yellow
Write-Host "  1. Open After Effects" -ForegroundColor White
Write-Host "  2. Go to: Window > Extensions > Views Asset Manager" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
exit 0

