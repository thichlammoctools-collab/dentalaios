/**
 * Typed application errors. The onError handler in index.ts maps these to JSON responses.
 *
 * Architecture note: errors thrown in services/routes carry NO clinical data.
 * Messages are generic; details go in `details` only for validation errors.
 */

import type { ErrorCode } from "@shared/constants";
import { ERROR_CODES } from "@shared/constants";

export class AppError extends Error {
  status: number;
  code: ErrorCode;
  details?: unknown;

  constructor(message: string, status: number, code: ErrorCode, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, ERROR_CODES.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, ERROR_CODES.NOT_FOUND);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, 422, ERROR_CODES.VALIDATION_ERROR, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, ERROR_CODES.CONFLICT);
  }
}