#requires -Version 5.1

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateSet('Validate', 'Build', 'BuildAndUp', 'Up', 'Down', 'Status', 'Logs', 'Recreate')]
    [string]$Action = 'BuildAndUp',

    [string[]]$Services,

    [switch]$NoCache,

    [switch]$SkipDockerCheck,

    [switch]$FollowLogs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

class Logger {
    static [Logger] $Instance

    [string]$LogDirectory
    [string]$LogPath

    Logger([string]$logDirectory, [string]$filePrefix) {
        $this.LogDirectory = $logDirectory
        if (-not (Test-Path -Path $this.LogDirectory)) {
            New-Item -ItemType Directory -Path $this.LogDirectory -Force | Out-Null
        }

        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $this.LogPath = Join-Path -Path $this.LogDirectory -ChildPath ("{0}-{1}.log" -f $filePrefix, $timestamp)
    }

    static [Logger] GetInstance([string]$logDirectory, [string]$filePrefix) {
        if (-not [Logger]::Instance) {
            [Logger]::Instance = [Logger]::new($logDirectory, $filePrefix)
        }
        return [Logger]::Instance
    }

    [void] WriteInfo([string]$message) {
        $this.Write('INFO', $message)
        Write-Host ("[INFO] {0}" -f $message) -ForegroundColor Cyan
    }

    [void] WriteSuccess([string]$message) {
        $this.Write('SUCCESS', $message)
        Write-Host ("[SUCCESS] {0}" -f $message) -ForegroundColor Green
    }

    [void] WriteWarning([string]$message) {
        $this.Write('WARNING', $message)
        Write-Warning $message
    }

    [void] WriteError([string]$message) {
        $this.Write('ERROR', $message)
        Write-Error $message
    }

    [void] WriteStep([string]$message) {
        $this.Write('STEP', $message)
        Write-Host ("[STEP] {0}" -f $message) -ForegroundColor Yellow
    }

    hidden [void] Write([string]$level, [string]$message) {
        $timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffK')
        $entry = "[{0}] [{1}] {2}" -f $timestamp, $level, $message
        Add-Content -Path $this.LogPath -Value $entry -Encoding UTF8
    }
}

class ComposeSettings {
    [string]$ScriptRoot
    [string]$RepoRoot
    [string]$DockerDirectory
    [string]$ComposeFile
    [string]$PrimaryEnvFile
    [string]$OverrideEnvFile
    [string]$LogDirectory
    [string]$LogFilePrefix
    [string[]]$ServiceNames
    [string[]]$RequiredBinaries
    [string]$ProjectName
    [string]$SharedNetworkName
    [int]$ReportUiHostPort
    [int]$ReportUiContainerPort

    ComposeSettings(
        [string]$scriptRoot,
        [string]$repoRoot,
        [string]$dockerDirectory,
        [string]$composeFile,
        [string]$primaryEnvFile,
        [string]$overrideEnvFile,
        [string]$logDirectory,
        [string]$logFilePrefix,
        [string[]]$serviceNames,
        [string[]]$requiredBinaries,
        [string]$projectName,
        [string]$sharedNetworkName,
        [int]$reportUiHostPort,
        [int]$reportUiContainerPort
    ) {
        $this.ScriptRoot = $scriptRoot
        $this.RepoRoot = $repoRoot
        $this.DockerDirectory = $dockerDirectory
        $this.ComposeFile = $composeFile
        $this.PrimaryEnvFile = $primaryEnvFile
        $this.OverrideEnvFile = $overrideEnvFile
        $this.LogDirectory = $logDirectory
        $this.LogFilePrefix = $logFilePrefix
        $this.ServiceNames = $serviceNames
        $this.RequiredBinaries = $requiredBinaries
        $this.ProjectName = $projectName
        $this.SharedNetworkName = $sharedNetworkName
        $this.ReportUiHostPort = $reportUiHostPort
        $this.ReportUiContainerPort = $reportUiContainerPort
    }

    static [ComposeSettings] Load([string]$scriptRoot) {
        $configPath = Join-Path -Path $scriptRoot -ChildPath 'compose-settings.psd1'
        if (-not (Test-Path -Path $configPath)) {
            throw "Central configuration file was not found at '$configPath'."
        }

        $config = Import-PowerShellDataFile -Path $configPath

        $repoRootValue = (Resolve-Path -Path (Join-Path -Path $scriptRoot -ChildPath '..\..\..\..')).Path
        $dockerDirectoryValue = $scriptRoot
        $composeFileValue = Join-Path -Path $dockerDirectoryValue -ChildPath $config.ComposeFile
        $primaryEnvFileValue = Join-Path -Path $dockerDirectoryValue -ChildPath $config.PrimaryEnvFile
        $overrideEnvFileValue = Join-Path -Path $dockerDirectoryValue -ChildPath $config.OverrideEnvFile
        $logDirectoryValue = Join-Path -Path $repoRootValue -ChildPath $config.LogDirectoryName

        return [ComposeSettings]::new(
            $scriptRoot,
            $repoRootValue,
            $dockerDirectoryValue,
            $composeFileValue,
            $primaryEnvFileValue,
            $overrideEnvFileValue,
            $logDirectoryValue,
            $config.LogFilePrefix,
            $config.ServiceNames,
            $config.RequiredBinaries,
            $config.ComposeProjectName,
            $config.SharedNetworkName,
            $config.ReportUiHostPort,
            $config.ReportUiContainerPort
        )
    }
}

class DockerCommandRunner {
    [ComposeSettings]$Settings
    [Logger]$Logger

    DockerCommandRunner([ComposeSettings]$settings, [Logger]$logger) {
        $this.Settings = $settings
        $this.Logger = $logger
    }

    [void] VerifyRequiredTools() {
        foreach ($binary in $this.Settings.RequiredBinaries) {
            $command = Get-Command -Name $binary -ErrorAction SilentlyContinue
            if (-not $command) {
                throw "Required tool '$binary' was not found in PATH. Install Docker Desktop or Docker Engine before running this script."
            }
        }
    }

    [void] ValidateComposeFiles() {
        $requiredFiles = @(
            $this.Settings.ComposeFile,
            $this.Settings.PrimaryEnvFile,
            $this.Settings.OverrideEnvFile
        )

        foreach ($file in $requiredFiles) {
            if (-not (Test-Path -Path $file)) {
                throw "Required file not found: $file"
            }
        }
    }

    [void] Execute([string[]]$arguments, [switch]$AllowFailure) {
        $this.Logger.WriteStep("Running: docker $($arguments -join ' ')")

        & docker @arguments
        $exitCode = $LASTEXITCODE

        if ($exitCode -ne 0 -and -not $AllowFailure) {
            $commandText = $arguments -join ' '
            throw ("Docker command failed with exit code {0}: docker {1}" -f $exitCode, $commandText)
        }
    }

    [string[]] CaptureOutput([string[]]$arguments) {
        $this.Logger.WriteStep("Capturing output: docker $($arguments -join ' ')")

        $output = & docker @arguments
        $exitCode = $LASTEXITCODE

        if ($exitCode -ne 0) {
            $commandText = $arguments -join ' '
            throw ("Docker command failed while capturing output with exit code {0}: docker {1}" -f $exitCode, $commandText)
        }

        return @($output)
    }
}

class ComposeActionFactory {
    static [string[]] BuildCommand([ComposeSettings]$settings, [string]$action, [bool]$noCache, [string[]]$services) {
        $base = @(
            'compose',
            '--env-file', $settings.PrimaryEnvFile,
            '--env-file', $settings.OverrideEnvFile,
            '-f', $settings.ComposeFile
        )

        $selectedServices = if ($services -and $services.Count -gt 0) { $services } else { $settings.ServiceNames }
        $command = @()

        switch ($action) {
            'Build' {
                $command = @($base + 'build')
                if ($noCache) {
                    $command += '--no-cache'
                }
                $command += $selectedServices
                break
            }
            'BuildAndUp' {
                $command = @($base + 'build')
                if ($noCache) {
                    $command += '--no-cache'
                }
                $command += $selectedServices
                break
            }
            'Up' {
                $command = @($base + 'up', '-d', '--remove-orphans') + $selectedServices
                break
            }
            'Down' {
                $command = @($base + 'down', '--remove-orphans')
                break
            }
            'Status' {
                $command = @($base + 'ps')
                break
            }
            'Logs' {
                $command = @($base + 'logs', '-f') + $selectedServices
                break
            }
            'Recreate' {
                $command = @($base + 'down', '--remove-orphans')
                break
            }
            default {
                throw "Unsupported action '$action'."
            }
        }

        return @($command)
    }
}

class PerformanceStackBuilder {
    [ComposeSettings]$Settings
    [Logger]$Logger
    [DockerCommandRunner]$Docker

    PerformanceStackBuilder([ComposeSettings]$settings, [Logger]$logger, [DockerCommandRunner]$docker) {
        $this.Settings = $settings
        $this.Logger = $logger
        $this.Docker = $docker
    }

    [void] Validate() {
        $this.Logger.WriteInfo("Validating Docker Compose setup for project '$($this.Settings.ProjectName)'.")
        $this.Docker.ValidateComposeFiles()
        $this.Logger.WriteSuccess('All compose files and env files are present.')
        $this.Logger.WriteInfo("Compose file: $($this.Settings.ComposeFile)")
        $this.Logger.WriteInfo("Primary env file: $($this.Settings.PrimaryEnvFile)")
        $this.Logger.WriteInfo("Local override env file: $($this.Settings.OverrideEnvFile)")
    }

    [void] Build([bool]$noCache, [string[]]$services) {
        $command = [ComposeActionFactory]::BuildCommand($this.Settings, 'Build', $noCache, $services)
        $this.Docker.Execute($command)
        $this.Logger.WriteSuccess('Docker images built successfully.')
    }

    [void] Up([string[]]$services) {
        $command = [ComposeActionFactory]::BuildCommand($this.Settings, 'Up', $false, $services)
        $this.Docker.Execute($command)
        $this.Logger.WriteSuccess('Docker Compose stack started successfully.')
    }

    [void] Down() {
        $command = [ComposeActionFactory]::BuildCommand($this.Settings, 'Down', $false, @())
        $this.Docker.Execute($command)
        $this.Logger.WriteSuccess('Docker Compose stack stopped and cleaned up.')
    }

    [void] Status() {
        $command = [ComposeActionFactory]::BuildCommand($this.Settings, 'Status', $false, @())
        $this.Docker.Execute($command)
    }

    [void] Logs([string[]]$services, [bool]$follow) {
        $selected = if ($services -and $services.Count -gt 0) { $services } else { $this.Settings.ServiceNames }
        $base = @('compose', '--env-file', $this.Settings.PrimaryEnvFile, '--env-file', $this.Settings.OverrideEnvFile, '-f', $this.Settings.ComposeFile, 'logs')
        if ($follow) {
            $base += '-f'
        }
        $this.Docker.Execute(@($base + $selected))
    }

    [void] Recreate([bool]$noCache, [string[]]$services) {
        $this.Logger.WriteStep('Recreating stack from scratch...')
        $this.Down()
        $this.Build($noCache, $services)
        $this.Up($services)
        $this.Logger.WriteSuccess('Stack recreation completed.')
    }

    [void] Execute([string]$action, [bool]$noCache, [string[]]$services, [bool]$followLogs) {
        switch ($action) {
            'Validate' {
                $this.Validate()
                break
            }
            'Build' {
                $this.Build($noCache, $services)
                break
            }
            'BuildAndUp' {
                $this.Build($noCache, $services)
                $this.Up($services)
                break
            }
            'Up' {
                $this.Up($services)
                break
            }
            'Down' {
                $this.Down()
                break
            }
            'Status' {
                $this.Status()
                break
            }
            'Logs' {
                $this.Logs($services, $followLogs)
                break
            }
            'Recreate' {
                $this.Recreate($noCache, $services)
                break
            }
            default {
                throw "Unsupported action '$action'."
            }
        }
    }
}

try {
    $scriptRoot = $PSScriptRoot
    $settings = [ComposeSettings]::Load($scriptRoot)
    $logger = [Logger]::GetInstance($settings.LogDirectory, $settings.LogFilePrefix)
    $dockerRunner = [DockerCommandRunner]::new($settings, $logger)

    if (-not $SkipDockerCheck) {
        $dockerRunner.VerifyRequiredTools()
    }

    $selectedServices = if ($Services -and $Services.Count -gt 0) { $Services } else { $settings.ServiceNames }

    $builder = [PerformanceStackBuilder]::new($settings, $logger, $dockerRunner)
    $builder.Execute($Action, $NoCache, $selectedServices, $FollowLogs)

    if ($Action -eq 'Validate') {
        $logger.WriteSuccess('Validation complete. No Docker side effects were executed.')
    }
}
catch {
    $message = $_.Exception.Message
    $stackTrace = $_.ScriptStackTrace
    $logger.WriteError($message)
    if ($stackTrace) {
        $logger.WriteWarning($stackTrace)
    }
    exit 1
}
