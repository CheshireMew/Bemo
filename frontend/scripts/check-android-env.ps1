param(
    [switch]$RequireKeystore
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

function Read-JavaMajorVersion([string]$JavaVersionOutput) {
    $firstLine = ($JavaVersionOutput -split "`r?`n" | Select-Object -First 1).Trim()

    if ($firstLine -match '"(?<version>\d+)(\.\d+)?') {
        return [int]$Matches.version
    }

    return $null
}

$frontendRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $frontendRoot "android"
$keystorePropertiesPath = Join-Path $androidRoot "keystore.properties"

if (-not $env:JAVA_HOME) {
    Fail "JAVA_HOME is not set. Android packaging currently requires JDK 17-25 with jlink."
}

$javaExe = Join-Path $env:JAVA_HOME "bin\java.exe"
if (-not (Test-Path $javaExe)) {
    Fail "JAVA_HOME points to an invalid directory: $env:JAVA_HOME"
}

$javaVersionOutput = cmd /c """$javaExe"" -version 2>&1" | Out-String
$javaMajorVersion = Read-JavaMajorVersion $javaVersionOutput

if ($null -eq $javaMajorVersion) {
    Fail "Could not parse the Java version output:`n$javaVersionOutput"
}

if ($javaMajorVersion -lt 17 -or $javaMajorVersion -ge 26) {
    Fail "Java major version $javaMajorVersion is not supported by the current Android Gradle setup. Switch JAVA_HOME to a JDK between 17 and 25."
}

$jlinkExe = Join-Path $env:JAVA_HOME "bin\jlink.exe"
if (-not (Test-Path $jlinkExe)) {
    Fail "JAVA_HOME does not include bin\\jlink.exe. Use a full JDK or Android Studio's bundled JBR."
}

if (-not ($env:ANDROID_HOME -or $env:ANDROID_SDK_ROOT)) {
    $localPropertiesPath = Join-Path $androidRoot "local.properties"
    if (-not (Test-Path $localPropertiesPath)) {
        Fail "ANDROID_HOME / ANDROID_SDK_ROOT is missing, and android\\local.properties was not found. Install the Android SDK and make it visible to Gradle."
    }
}

if ($RequireKeystore -and -not (Test-Path $keystorePropertiesPath)) {
    Fail "android\\keystore.properties is missing. Copy keystore.properties.example and fill in the real signing values before building release artifacts."
}

Write-Host "Android packaging environment check passed."
Write-Host ("JAVA_HOME={0}" -f $env:JAVA_HOME)
Write-Host ("Java major version={0}" -f $javaMajorVersion)
