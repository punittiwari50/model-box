class PipelineLogger {
  [string]$Prefix

  PipelineLogger([string]$prefix) {
    $this.Prefix = $prefix
  }

  [void] Info([string]$message) {
    Write-Host "[$($this.Prefix)] $message"
  }

  [void] Warn([string]$message) {
    Write-Warning "[$($this.Prefix)] $message"
  }

  [void] Error([string]$message) {
    Write-Error "[$($this.Prefix)] $message"
  }
}

class DockerExecutor {
  [PipelineLogger]$Logger

  DockerExecutor([PipelineLogger]$logger) {
    $this.Logger = $logger
  }

  [void] Run([string[]]$arguments) {
    & docker @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Docker command failed with exit code ${LASTEXITCODE}: docker $($arguments -join ' ')"
    }
  }

  [void] RunDetached([string[]]$arguments) {
    $process = Start-Process -FilePath 'docker' -ArgumentList $arguments -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      throw "Docker command failed with exit code $($process.ExitCode): docker $($arguments -join ' ')"
    }
  }

  [string[]] Capture([string[]]$arguments) {
    $output = & docker @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Docker command failed with exit code ${LASTEXITCODE}: docker $($arguments -join ' ')"
    }
    return @($output)
  }
}

class SmokePipeline {
  [PipelineLogger]$Logger
  [DockerExecutor]$Docker
  [string]$RepoRoot
  [string]$OllamaComposeFile
  [string]$OllamaEnvFile
  [string]$GatlingComposeFile
  [string]$GatlingEnvFile
  [string]$GatlingDotenvFile
  [string]$ReportRoot = '/reports'
  [string]$WorkingDir = '/workspace/modules/infra-gatling-java'
  [string]$SmokeSimulations = 'com.modelbox.simulation.ollama.OllamaJavaLoadSimulation,com.modelbox.simulation.ollama.OllamaJavaStressSimulation'
  [string[]]$DiscoveredModels = @()

  SmokePipeline([string]$repoRoot) {
    $this.RepoRoot = $repoRoot
    $this.OllamaComposeFile = Join-Path $this.RepoRoot 'infra\ollama\docker\compose.ollama.yaml'
    $this.OllamaEnvFile = Join-Path $this.RepoRoot 'infra\ollama\docker\ollama.env'
    $this.GatlingComposeFile = Join-Path $this.RepoRoot 'infra\performance\infra-gatling\docker\compose.performance.yaml'
    $this.GatlingEnvFile = Join-Path $this.RepoRoot 'infra\performance\infra-gatling\docker\performance-local.env'
    $this.GatlingDotenvFile = Join-Path $this.RepoRoot 'infra\performance\infra-gatling\docker\.env'
    $this.Logger = [PipelineLogger]::new('smoke-pipeline')
    $this.Docker = [DockerExecutor]::new($this.Logger)
  }

  [void] RecreateOllamaStack() {
    $this.Logger.Info('Recreating Ollama stack from scratch')
    $this.Docker.RunDetached(@('compose', '--env-file', $this.OllamaEnvFile, '-f', $this.OllamaComposeFile, 'down', '-v', '--remove-orphans'))
    $this.Docker.RunDetached(@('compose', '--env-file', $this.OllamaEnvFile, '-f', $this.OllamaComposeFile, 'up', '-d', '--build', '--force-recreate'))
  }

  [string[]] DiscoverModels() {
    $attempt = 0
    while ($attempt -lt 18) {
      try {
        $output = $this.Docker.Capture(@('exec', 'ollama-model-service', 'ollama', 'list'))
        $models = $output | Select-Object -Skip 1 | ForEach-Object {
          if ($_ -match '^(?<name>\S+)') { $Matches.name }
        } | Where-Object { $_ } | Sort-Object -Unique
        if ($models.Count -gt 0) {
          return @($models)
        }
      } catch {
        # allow retry until the service is ready
      }

      $attempt += 1
      Start-Sleep -Seconds 5
    }

    throw 'No Ollama models discovered from the container. Configure OLLAMA_PRELOAD_MODELS or pre-pull models before running smoke tests.'
  }

  [void] RunModelSuite([string]$model) {
    $this.Logger.Info("Running smoke suite for model: $model")
    $this.Docker.Run(@(
      'compose',
      '-f', $this.GatlingComposeFile,
      '--env-file', $this.GatlingDotenvFile,
      '--env-file', $this.GatlingEnvFile,
      'run', '--rm', '--build',
      '-e', "OLLAMA_MODEL=$model",
      '-e', "GATLING_SIMULATIONS=$($this.SmokeSimulations)",
      'gatling-service'
    ))
  }

  [string] SanitizeTag([string]$value) {
    return ($value -replace '[/:\s]+', '_' -replace '[^A-Za-z0-9._-]', '_').Trim('_')
  }

  [void] WriteSummary() {
    $summaryFile = Join-Path $this.ReportRoot 'smoke-summary.html'
    $runRoot = Join-Path $this.ReportRoot 'runs'
    $rows = New-Object System.Collections.Generic.List[string]

    if (Test-Path $runRoot) {
      Get-ChildItem -Path $runRoot -Directory | Sort-Object Name -Descending | ForEach-Object {
        $parts = $_.Name -split '~', 3
        if ($parts.Count -ge 3 -and (Test-Path (Join-Path $_.FullName 'index.html'))) {
          $timestamp = $parts[0]
          $model = $parts[1]
          $scenario = $parts[2] -replace '_', '.'
          $rows.Add("      <tr><td>$timestamp</td><td>$model</td><td>$scenario</td><td><a href='runs/$($_.Name)/index.html'>Open</a></td></tr>")
        }
      }
    }

    $html = @(
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <title>ModelBox Smoke Summary</title>',
      '  <style>',
      '    body { font-family: Arial, sans-serif; margin: 2rem; background: #fafafa; color: #111827; }',
      '    table { border-collapse: collapse; width: 100%; background: #fff; }',
      '    th, td { border: 1px solid #d1d5db; padding: 0.65rem; text-align: left; }',
      '    th { background: #111827; color: #fff; }',
      '    tr:nth-child(even) { background: #f9fafb; }',
      '    a { color: #0f62fe; }',
      '  </style>',
      '</head>',
      '<body>',
      '  <h1>Smoke Summary</h1>',
      '  <table>',
      '    <thead>',
      '      <tr><th>Timestamp</th><th>Model</th><th>Scenario</th><th>Report</th></tr>',
      '    </thead>',
      '    <tbody>'
    )

    $html += $rows
    $html += @(
      '    </tbody>',
      '  </table>',
      '</body>',
      '</html>'
    )

    $html | Set-Content -Path $summaryFile -Encoding utf8
    $this.Logger.Info("Smoke summary ready at $summaryFile")
  }

  [void] Execute() {
    $this.RecreateOllamaStack()
    $this.Logger.Info('Waiting for Ollama model inventory')
    $this.DiscoveredModels = $this.DiscoverModels()

    foreach ($model in $this.DiscoveredModels) {
      if (-not [string]::IsNullOrWhiteSpace($model)) {
        $this.RunModelSuite($model)
      }
    }

    $this.WriteSummary()
    $this.Logger.Info('Smoke pipeline completed successfully')
  }
}

try {
  $scriptRoot = $PSScriptRoot
  $repoRoot = $scriptRoot
  foreach ($ignored in 1..3) {
    $repoRoot = Split-Path -Parent $repoRoot
  }
  [SmokePipeline]::new($repoRoot).Execute()
} catch {
  Write-Error $_
  exit 1
}