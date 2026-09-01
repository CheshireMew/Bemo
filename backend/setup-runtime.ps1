param(
  [string]$PythonPath = 'D:\Tools\Python310\python.exe',
  [string]$VenvPath = 'D:\Tools\Bemo\venv',
  [switch]$DesktopBuild
)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath (Join-Path $VenvPath 'Scripts\python.exe'))) {
  & $PythonPath -m venv $VenvPath
  if ($LASTEXITCODE -ne 0) { throw '创建 Python 环境失败。' }
}
$runtimePython = Join-Path $VenvPath 'Scripts\python.exe'
$requirements = if ($DesktopBuild) { 'requirements-build.txt' } else { 'requirements.txt' }
& $runtimePython -m pip install --cache-dir D:\Tools\pip-cache -r (Join-Path $PSScriptRoot $requirements)
if ($LASTEXITCODE -ne 0) { throw '安装依赖失败。' }
Write-Host "运行环境已准备好。请将 BEMO_PYTHON 设置为 $runtimePython"
