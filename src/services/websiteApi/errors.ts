// ============================================================================
// Website API Error Classes — Desktop App
// ============================================================================

/** Thrown when the API returns an error response (4xx/5xx) */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(message: string, statusCode: number, errorCode: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/** Thrown when the network request fails (timeout, DNS, offline) */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Thrown when the payload fails local validation before sending */
export class ValidationError extends Error {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}
