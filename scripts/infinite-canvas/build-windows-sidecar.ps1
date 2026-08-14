param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [string]$OutputPath = "",
    [string]$DockerImagePrefix = ""
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptRoot "..\..")).Path
$sourceRoot = (Resolve-Path $SourcePath).Path

if (-not (Test-Path (Join-Path $sourceRoot "go.mod")) -or -not (Test-Path (Join-Path $sourceRoot "web\package.json"))) {
    throw "SourcePath is not a tigerowo/infinite-canvas source checkout."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $projectRoot "electron\resources\extra\common\infinite-canvas"
}
$outputRoot = [System.IO.Path]::GetFullPath($OutputPath)
$manifestPath = Join-Path $outputRoot "sidecar.json"
if (Test-Path $manifestPath) {
    throw "A sidecar already exists at $outputRoot. Move it aside before rebuilding."
}

$docker = Get-Command docker -ErrorAction Stop
$dockerInfo = & $docker.Source info --format "{{.ServerVersion}}"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($dockerInfo)) {
    throw "Docker Desktop is not running."
}

$buildId = [Guid]::NewGuid().ToString("N")
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) "aigcpanel-infinite-canvas-$buildId"
$imageName = "aigcpanel-infinite-canvas-bundle:$buildId"
$containerName = "aigcpanel-infinite-canvas-export-$buildId"
$imageBuilt = $false
$containerCreated = $false
$imagePrefix = $DockerImagePrefix.Trim().TrimEnd("/")
if ($imagePrefix) { $imagePrefix += "/" }
$bunImage = "${imagePrefix}oven/bun:1.3.14"
$goImage = "${imagePrefix}library/golang:1.25-alpine"

try {
    New-Item -ItemType Directory -Path $stagingRoot | Out-Null
    Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $stagingRoot -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $scriptRoot "main.go") -Destination (Join-Path $stagingRoot "main.go") -Force
    $protocolPatch = Join-Path $scriptRoot "workbench-protocol.patch"
    $canvasPickerPath = "web/src/app/(user)/canvas/components/asset-picker-modal.tsx"
    $canvasPanelPath = "web/src/app/(user)/canvas/components/canvas-side-panel.tsx"
    & git -C $stagingRoot apply --check --reverse --exclude=$canvasPickerPath --exclude=$canvasPanelPath $protocolPatch 2>$null
    if ($LASTEXITCODE -ne 0) {
        & git -C $stagingRoot apply --whitespace=nowarn --exclude=$canvasPickerPath --exclude=$canvasPanelPath $protocolPatch
        if ($LASTEXITCODE -ne 0) { throw "Could not apply the workbench protocol adapter patch." }
    }
    $materialDeletePatch = Join-Path $scriptRoot "canvas-material-delete.patch"
    & git -C $stagingRoot apply --check --reverse $materialDeletePatch 2>$null
    if ($LASTEXITCODE -ne 0) {
        & git -C $stagingRoot apply --whitespace=nowarn $materialDeletePatch
        if ($LASTEXITCODE -ne 0) { throw "Could not apply the canvas material delete patch." }
    }
    $workflowNodesPatch = Join-Path $scriptRoot "canvas-workflow-nodes.patch"
    & git -C $stagingRoot apply --check --reverse $workflowNodesPatch 2>$null
    if ($LASTEXITCODE -ne 0) {
        & git -C $stagingRoot apply --whitespace=nowarn $workflowNodesPatch
        if ($LASTEXITCODE -ne 0) { throw "Could not apply the canvas workflow nodes patch." }
    }
    Copy-Item -LiteralPath (Join-Path $scriptRoot "Dockerfile.windows") -Destination (Join-Path $stagingRoot "Dockerfile.workbench") -Force
    Copy-Item -LiteralPath (Join-Path $scriptRoot "MODIFICATIONS.md") -Destination (Join-Path $stagingRoot "MODIFICATIONS.md") -Force

    Write-Output "Using Bun image: $bunImage"
    Write-Output "Using Go image:  $goImage"
    & $docker.Source build --file (Join-Path $stagingRoot "Dockerfile.workbench") --build-arg "BUN_IMAGE=$bunImage" --build-arg "GO_IMAGE=$goImage" --tag $imageName $stagingRoot
    if ($LASTEXITCODE -ne 0) { throw "Infinite canvas Docker build failed." }
    $imageBuilt = $true

    # The artifact image is based on scratch and is never started. Docker still
    # requires a command when creating the temporary container used by `cp`.
    & $docker.Source create --name $containerName $imageName "/not-used" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not create the export container." }
    $containerCreated = $true

    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    & $docker.Source cp "${containerName}:/bundle/." $outputRoot
    if ($LASTEXITCODE -ne 0) { throw "Could not export the sidecar bundle." }

    $version = (Get-Content -LiteralPath (Join-Path $sourceRoot "VERSION") -Raw).Trim()
    $manifest = [ordered]@{
        version = "$version+workbench.18"
        apiExecutable = "api/server.exe"
        webEntry = "web/server.js"
        healthPath = "/api/health"
        loopbackOnly = $true
    }
    $manifestJson = $manifest | ConvertTo-Json
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8WithoutBom)
    Write-Output "Sidecar bundle created at $outputRoot"
}
finally {
    if ($containerCreated) {
        & $docker.Source rm --force $containerName 2>$null | Out-Null
    }
    if ($imageBuilt) {
        & $docker.Source image rm --force $imageName 2>$null | Out-Null
    }
    $resolvedTemp = [System.IO.Path]::GetFullPath($stagingRoot)
    $systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTemp.StartsWith($systemTemp) -and (Split-Path $resolvedTemp -Leaf).StartsWith("aigcpanel-infinite-canvas-")) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
