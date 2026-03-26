param(
    [ValidateSet("sync", "debug", "release", "bundle", "open")]
    [string]$Task = "sync"
)

$ErrorActionPreference = "Stop"

function Run-Step([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    Write-Host "==> $FilePath $($Arguments -join ' ')"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
}

function Normalize-AndroidGradleFiles([string]$AndroidRoot) {
    $cordovaGradlePath = Join-Path $AndroidRoot "capacitor-cordova-android-plugins/build.gradle"
    if (-not (Test-Path $cordovaGradlePath)) {
        return
    }

    $lines = Get-Content -Path $cordovaGradlePath
    $normalizedLines = New-Object System.Collections.Generic.List[string]
    $skipFlatDirBlock = $false

    foreach ($line in $lines) {
        $trimmed = $line.Trim()

        if ($skipFlatDirBlock) {
            if ($trimmed -eq "}") {
                $skipFlatDirBlock = $false
            }
            continue
        }

        if ($trimmed -eq "flatDir{" -or $trimmed -eq "flatDir {") {
            $skipFlatDirBlock = $true
            continue
        }

        if ($trimmed -eq "implementation fileTree(dir: 'src/main/libs', include: ['*.jar'])") {
            continue
        }

        $normalizedLines.Add($line)
    }

    $normalized = ($normalizedLines -join "`r`n") + "`r`n"
    $content = Get-Content -Path $cordovaGradlePath -Raw
    if ($normalized -ne $content) {
        [System.IO.File]::WriteAllText($cordovaGradlePath, $normalized, [System.Text.UTF8Encoding]::new($false))
    }
}

$frontendRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $frontendRoot "android"
$checkScriptPath = Join-Path $PSScriptRoot "check-android-env.ps1"
$requiresKeystore = $Task -in @("release", "bundle")

$checkArgs = @("-ExecutionPolicy", "Bypass", "-File", $checkScriptPath)
if ($requiresKeystore) {
    $checkArgs += "-RequireKeystore"
}

Run-Step -FilePath "powershell.exe" -Arguments $checkArgs -WorkingDirectory $frontendRoot

if ($Task -eq "open") {
    Run-Step -FilePath "npx.cmd" -Arguments @("cap", "open", "android") -WorkingDirectory $frontendRoot
    exit 0
}

Run-Step -FilePath "npm.cmd" -Arguments @("run", "build:android") -WorkingDirectory $frontendRoot
Run-Step -FilePath "npx.cmd" -Arguments @("cap", "sync", "android") -WorkingDirectory $frontendRoot
Normalize-AndroidGradleFiles -AndroidRoot $androidRoot

switch ($Task) {
    "debug" {
        Run-Step -FilePath (Join-Path $androidRoot "gradlew.bat") -Arguments @("assembleDebug") -WorkingDirectory $androidRoot
    }
    "release" {
        Run-Step -FilePath (Join-Path $androidRoot "gradlew.bat") -Arguments @("assembleRelease") -WorkingDirectory $androidRoot
    }
    "bundle" {
        Run-Step -FilePath (Join-Path $androidRoot "gradlew.bat") -Arguments @("bundleRelease") -WorkingDirectory $androidRoot
    }
}
