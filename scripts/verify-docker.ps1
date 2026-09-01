param([switch]$ConfirmTestDeployment)
$ErrorActionPreference = 'Stop'
if (!$ConfirmTestDeployment) { throw '此命令会创建专用测试部署并写入测试笔记。请明确传入 -ConfirmTestDeployment。' }
if (!$env:BEMO_AUTH_FILE -or !$env:BEMO_TEST_USER -or !$env:BEMO_TEST_PASSWORD) {
  throw '请设置 BEMO_AUTH_FILE、BEMO_TEST_USER、BEMO_TEST_PASSWORD。只使用测试账号。'
}
$projectName = 'bemo-test-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$repoPath = Split-Path -Parent $PSScriptRoot
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$testPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
$oldPort = $env:BEMO_WEB_PORT
$oldBind = $env:BEMO_BIND_ADDRESS
$env:BEMO_WEB_PORT = [string]$testPort
$env:BEMO_BIND_ADDRESS = '127.0.0.1'
$origin = "http://127.0.0.1:$testPort"
$auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($env:BEMO_TEST_USER):$($env:BEMO_TEST_PASSWORD)"))
$headers = @{ Authorization = "Basic $auth" }

function Assert-Unauthorized([string]$Path, [string]$Method = 'GET') {
  try { Invoke-WebRequest -Uri "$origin$Path" -Method $Method -UseBasicParsing -ErrorAction Stop | Out-Null }
  catch {
    if ([int]$_.Exception.Response.StatusCode -eq 401) { return }
    throw
  }
  throw "未登录请求没有被拒绝：$Method $Path"
}

Push-Location $repoPath
try {
  docker compose -p $projectName up --build --wait -d
  if ($LASTEXITCODE -ne 0) { throw '测试部署启动失败。' }
  Assert-Unauthorized '/'
  Assert-Unauthorized '/api/app/notes/'
  Assert-Unauthorized '/api/app/storage' 'DELETE'
  Assert-Unauthorized '/api/sync/info'
  $page = Invoke-WebRequest -Uri $origin -Headers $headers -UseBasicParsing
  if ($page.Content -notmatch 'id="app"') { throw '没有取得 Bemo 页面。' }
  $body = @{ content = "deployment-$projectName"; tags = @() } | ConvertTo-Json -Compress
  $note = Invoke-RestMethod -Uri "$origin/api/app/notes/" -Method POST -Headers $headers -ContentType 'application/json' -Body $body
  $multipart = "--bemo-test-boundary`r`nContent-Disposition: form-data; name=`"file`"; filename=`"probe.txt`"`r`nContent-Type: text/plain`r`n`r`nbemo-attachment`r`n--bemo-test-boundary--`r`n"
  Invoke-RestMethod -Uri "$origin/api/app/attachments" -Method POST -Headers $headers -ContentType 'multipart/form-data; boundary=bemo-test-boundary' -Body $multipart | Out-Null
  Assert-Unauthorized '/images/probe.txt'
  docker compose -p $projectName restart backend
  if ($LASTEXITCODE -ne 0) { throw '测试后端重启失败。' }
  $notes = $null
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $notes = Invoke-RestMethod -Uri "$origin/api/app/notes/" -Headers $headers; break }
    catch { Start-Sleep -Milliseconds 500 }
  }
  if (!($notes | Where-Object note_id -EQ $note.note_id)) { throw '重启后笔记丢失。' }
  $asset = Invoke-WebRequest -Uri "$origin/images/probe.txt" -Headers $headers -UseBasicParsing
  if ([string]$asset.Content -notmatch 'bemo-attachment') { throw '重启后附件不可用。' }
  @{ status = 'pass'; project = $projectName; checks = @('authentication', 'same-origin-page-and-api', 'attachment-access', 'restart-persistence') } | ConvertTo-Json
} finally {
  docker compose -p $projectName down
  # No -v: retain the isolated test volume for inspection until cleanup is approved.
  Write-Host "保留测试卷：${projectName}_bemo_data"
  Pop-Location
  $env:BEMO_WEB_PORT = $oldPort
  $env:BEMO_BIND_ADDRESS = $oldBind
}
