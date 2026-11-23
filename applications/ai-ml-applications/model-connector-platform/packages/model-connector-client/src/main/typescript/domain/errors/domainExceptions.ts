/**
 * Strongly typed Domain Exceptions for Model Connector.
 * Conforms to STD-COD-007.4: Resilient Error Handling (typed domain exceptions).
 */

export class ModelConnectorException extends Error {
  public readonly code: string;
  public readonly correlationId?: string;

  constructor(message: string, code = "MODEL_CONNECTOR_ERROR", correlationId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.correlationId = correlationId;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class CliExecutionException extends ModelConnectorException {
  public readonly exitCode?: number;
  public readonly stderrOutput?: string;

  constructor(
    message: string,
    exitCode?: number,
    stderrOutput?: string,
    correlationId?: string,
  ) {
    super(message, "CLI_EXECUTION_ERROR", correlationId);
    this.exitCode = exitCode;
    this.stderrOutput = stderrOutput;
  }
}

export class ApiTransportException extends ModelConnectorException {
  public readonly statusCode?: number;
  public readonly responseBody?: string;

  constructor(
    message: string,
    statusCode?: number,
    responseBody?: string,
    correlationId?: string,
  ) {
    super(message, "API_TRANSPORT_ERROR", correlationId);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class SessionCookieException extends ModelConnectorException {
  constructor(message: string, correlationId?: string) {
    super(message, "SESSION_COOKIE_ERROR", correlationId);
  }
}

export class UpstreamUnavailableException extends ModelConnectorException {
  constructor(message: string, correlationId?: string) {
    super(message, "UPSTREAM_UNAVAILABLE_ERROR", correlationId);
  }
}
