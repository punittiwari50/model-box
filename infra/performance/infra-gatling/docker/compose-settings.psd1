@{
    ComposeProjectName = 'performance-model-box-test'
    ComposeFile = 'compose.performance.yaml'
    PrimaryEnvFile = '.env'
    OverrideEnvFile = 'performance-local.env'
    ServiceNames = @('gatling-service', 'report-service')
    SharedNetworkName = 'model-box_default'
    DefaultAction = 'BuildAndUp'
    LogDirectoryName = 'infra\logs'
    LogFilePrefix = 'performance-stack'
    RequiredBinaries = @('docker')
    ReportUiHostPort = 8080
    ReportUiContainerPort = 8080
}
