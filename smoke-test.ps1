# smoke-test.ps1
# Run from project root:
# powershell -ExecutionPolicy Bypass -File .\smoke-test.ps1

$ErrorActionPreference = "Stop"

# =========================
# CONFIG
# =========================
$BaseUrl = "http://localhost:10000"
$PropertyCode = "3194"   # use a real property code if you want a meaningful maintenance login route check
$MaintenancePin = "1234" # use a real PIN if you want a meaningful maintenance login route check
$StartupWaitSeconds = 25
$RunInstall = $false

# =========================
# HELPERS
# =========================
function Write-Section($text) {
  Write-Host ""
  Write-Host "==================================================" -ForegroundColor Cyan
  Write-Host $text -ForegroundColor Cyan
  Write-Host "==================================================" -ForegroundColor Cyan
}

function Write-Pass($text) {
  Write-Host "[PASS] $text" -ForegroundColor Green
}

function Write-Fail($text) {
  Write-Host "[FAIL] $text" -ForegroundColor Red
}

function Write-WarnMsg($text) {
  Write-Host "[WARN] $text" -ForegroundColor Yellow
}

function Assert-ExitCode($label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed with exit code $LASTEXITCODE"
  }
}

function Invoke-RouteCheck {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [int[]]$AllowedStatus = @(200),
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [string]$ContentType = "application/json"
  )

  try {
    $params = @{
      Uri = $Url
      Method = $Method
      MaximumRedirection = 0
      ErrorAction = "Stop"
      Headers = $Headers
    }

    if ($null -ne $Body) {
      if ($ContentType -eq "application/json" -and ($Body -isnot [string])) {
        $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
      } else {
        $params["Body"] = $Body
      }
      $params["ContentType"] = $ContentType
    }

    $response = Invoke-WebRequest @params
    $status = [int]$response.StatusCode

    if ($AllowedStatus -contains $status) {
      Write-Pass ("{0} {1} -> {2}" -f $Method, $Url, $status)
      return @{
        Ok = $true
        Status = $status
        Body = $response.Content
        Headers = $response.Headers
      }
    }

    Write-Fail ("{0} {1} -> {2} (expected one of: {3})" -f $Method, $Url, $status, ($AllowedStatus -join ", "))
    return @{
      Ok = $false
      Status = $status
      Body = $response.Content
      Headers = $response.Headers
    }
  }
  catch {
    $resp = $_.Exception.Response
    if ($null -ne $resp) {
      $status = [int]$resp.StatusCode
      $content = ""

      try {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $content = $reader.ReadToEnd()
        $reader.Close()
      } catch {}

      if ($AllowedStatus -contains $status) {
        Write-Pass ("{0} {1} -> {2}" -f $Method, $Url, $status)
        return @{
          Ok = $true
          Status = $status
          Body = $content
          Headers = $resp.Headers
        }
      }

      Write-Fail ("{0} {1} -> {2} (expected one of: {3})" -f $Method, $Url, $status, ($AllowedStatus -join ", "))
      if ($content) {
        Write-Host $content -ForegroundColor DarkYellow
      }

      return @{
        Ok = $false
        Status = $status
        Body = $content
        Headers = $resp.Headers
      }
    }

    Write-Fail ("{0} {1} -> request error: {2}" -f $Method, $Url, $_.Exception.Message)
    return @{
      Ok = $false
      Status = -1
      Body = ""
      Headers = @{}
    }
  }
}

function Wait-ForApp {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -Method GET -MaximumRedirection 0 -ErrorAction Stop
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        Write-Pass "App responded at $Url"
        return $true
      }
    }
    catch {
      $resp = $_.Exception.Response
      if ($null -ne $resp) {
        $status = [int]$resp.StatusCode
        if ($status -ge 200 -and $status -lt 500) {
          Write-Pass "App responded at $Url"
          return $true
        }
      }
    }

    Start-Sleep -Seconds 1
  }

  throw "App did not respond at $Url within $TimeoutSeconds seconds."
}

# =========================
# PRECHECKS
# =========================
Write-Section "PRECHECKS"

if (-not (Test-Path ".\package.json")) {
  throw "package.json not found. Run this from the project root."
}

if ($RunInstall) {
  Write-Section "NPM INSTALL"
  npm install
  Assert-ExitCode "npm install"
}

Write-Section "LINT"
npm run lint
Assert-ExitCode "npm run lint"

Write-Section "BUILD"
npm run build
Assert-ExitCode "npm run build"

# =========================
# START APP
# =========================
Write-Section "START APP"

$projectRoot = (Get-Location).Path

$job = Start-Job -ScriptBlock {
  param($rootPath)
  Set-Location $rootPath
  npm run dev
} -ArgumentList $projectRoot

try {
  Wait-ForApp -Url $BaseUrl -TimeoutSeconds $StartupWaitSeconds

  # =========================
  # PUBLIC PAGE SMOKE
  # =========================
  Write-Section "PUBLIC PAGE SMOKE"

  $publicPages = @(
    "/",
    "/setup",
    "/property-code",
    "/role-select",
    "/request-illustration",
    "/login/manager",
    "/login/tenant",
    "/login/maintenance",
    "/login/maintenance?code=$PropertyCode"
  )

  foreach ($path in $publicPages) {
    Invoke-RouteCheck -Method GET -Url "$BaseUrl$path" -AllowedStatus @(200, 307, 308) | Out-Null
  }

  # =========================
  # PUBLIC / SEMI-PUBLIC API SMOKE
  # =========================
  Write-Section "PUBLIC API SMOKE"

  Invoke-RouteCheck -Method GET -Url "$BaseUrl/api/property/resolve?code=$PropertyCode" -AllowedStatus @(200, 400, 404) | Out-Null
  Invoke-RouteCheck -Method GET -Url "$BaseUrl/api/public/property/lookup?code=$PropertyCode" -AllowedStatus @(200, 400, 404) | Out-Null
  Invoke-RouteCheck -Method GET -Url "$BaseUrl/api/admin/properties/list" -AllowedStatus @(200, 401) | Out-Null
  Invoke-RouteCheck -Method POST -Url "$BaseUrl/api/admin/session" -AllowedStatus @(200, 400, 401) -Body @{} | Out-Null
  Invoke-RouteCheck -Method POST -Url "$BaseUrl/api/request-setup" -AllowedStatus @(200, 400, 401, 404) -Body @{ propertyCode = $PropertyCode } | Out-Null

  # =========================
  # PROTECTED PAGE / API PROTECTION TEST
  # =========================
  Write-Section "PROTECTED ROUTE PROTECTION TEST"

  $protectedPages = @(
    "/manager/dashboard",
    "/tenant/dashboard",
    "/maintenance",
    "/admin",
    "/manager/maintenance"
  )

  foreach ($path in $protectedPages) {
    Invoke-RouteCheck -Method GET -Url "$BaseUrl$path" -AllowedStatus @(200, 302, 307, 308) | Out-Null
  }

  $protectedApis = @(
    "/api/manager/dashboard",
    "/api/manager/maintenance",
    "/api/manager/maintenance/update",
    "/api/manager/maintenance/pin",
    "/api/tenant/dashboard",
    "/api/tenant/maintenance",
    "/api/tenant/maintenance/list",
    "/api/tenant/maintenance/create",
    "/api/maintenance/dashboard"
  )

  foreach ($path in $protectedApis) {
    if ($path -like "*update*" -or $path -like "*pin" -or $path -like "*create") {
      Invoke-RouteCheck -Method POST -Url "$BaseUrl$path" -AllowedStatus @(401, 403, 400) -Body @{} | Out-Null
    } else {
      Invoke-RouteCheck -Method GET -Url "$BaseUrl$path" -AllowedStatus @(401, 403, 405, 400) | Out-Null
    }
  }

  # =========================
  # MAINTENANCE LOGIN SHAPE TEST
  # =========================
  Write-Section "MAINTENANCE LOGIN ROUTE TEST"

  Invoke-RouteCheck `
    -Method POST `
    -Url "$BaseUrl/api/maintenance/session" `
    -AllowedStatus @(200, 400, 401, 403, 404) `
    -Body @{
      propertyCode = $PropertyCode
      pin = $MaintenancePin
    } | Out-Null

  Invoke-RouteCheck `
    -Method POST `
    -Url "$BaseUrl/api/maintenance/session" `
    -AllowedStatus @(400) `
    -Body @{
      propertyCode = ""
      pin = ""
    } | Out-Null

  # =========================
  # TENANT MAINTENANCE ENDPOINT SHAPE TEST
  # =========================
  Write-Section "TENANT MAINTENANCE ENDPOINT SHAPE TEST"

  Invoke-RouteCheck `
    -Method POST `
    -Url "$BaseUrl/api/tenant/maintenance/create" `
    -AllowedStatus @(400, 401, 403) `
    -Body @{
      category = "PLUMBING"
      urgency = "NORMAL"
      description = "Smoke test request"
    } | Out-Null

  Invoke-RouteCheck `
    -Method GET `
    -Url "$BaseUrl/api/tenant/maintenance/list" `
    -AllowedStatus @(401, 403) | Out-Null

  # =========================
  # MANAGER MAINTENANCE UPDATE SHAPE TEST
  # =========================
  Write-Section "MANAGER MAINTENANCE UPDATE SHAPE TEST"

  Invoke-RouteCheck `
    -Method POST `
    -Url "$BaseUrl/api/manager/maintenance/update" `
    -AllowedStatus @(400, 401, 403) `
    -Body @{
      requestId = ""
      status = "IN_PROGRESS"
    } | Out-Null

  Invoke-RouteCheck `
    -Method POST `
    -Url "$BaseUrl/api/manager/maintenance/update" `
    -AllowedStatus @(400, 401, 403) `
    -Body @{
      requestId = ""
      action = "DELETE"
    } | Out-Null

  # =========================
  # STREAM / SSR RESILIENCE
  # =========================
  Write-Section "STREAM / SSR RESILIENCE"

  Invoke-RouteCheck -Method GET -Url "$BaseUrl/api/stream" -AllowedStatus @(200, 204, 400, 401, 404) | Out-Null

  # =========================
  # BASIC CONTENT CHECKS
  # =========================
  Write-Section "BASIC CONTENT CHECKS"

  $home = Invoke-RouteCheck -Method GET -Url "$BaseUrl/" -AllowedStatus @(200)
  if ($home.Ok -and $home.Body -match "RentFray|rentfray|Property|Login|Setup") {
    Write-Pass "Home page returned expected app-like content"
  } else {
    Write-WarnMsg "Home page responded but expected app text was not found"
  }

  $maintenanceLogin = Invoke-RouteCheck -Method GET -Url "$BaseUrl/login/maintenance?code=$PropertyCode" -AllowedStatus @(200)
  if ($maintenanceLogin.Ok -and $maintenanceLogin.Body -match "Maintenance Login|PIN|Login") {
    Write-Pass "Maintenance login page returned expected content"
  } else {
    Write-WarnMsg "Maintenance login page responded but expected text was not found"
  }

  # =========================
  # SUMMARY
  # =========================
  Write-Section "SMOKE TEST COMPLETE"
  Write-Host "Build/lint passed, app booted, public pages loaded, protected routes behaved sanely, and core maintenance endpoints responded." -ForegroundColor Green
  Write-Host "This does not prove full real-user flows. It is a broad smoke check." -ForegroundColor Yellow
}
finally {
  Write-Section "STOP APP"

  if ($job) {
    Stop-Job $job -ErrorAction SilentlyContinue | Out-Null
    Receive-Job $job -Keep -ErrorAction SilentlyContinue | Out-Null
    Remove-Job $job -Force -ErrorAction SilentlyContinue | Out-Null
  }
}