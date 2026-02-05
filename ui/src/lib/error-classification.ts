/**
 * Error classification and user-friendly message generation
 */

export enum ErrorSeverity {
	CRITICAL = "critical",
	HIGH = "high",
	MEDIUM = "medium",
	LOW = "low",
}

export enum ErrorType {
	NETWORK = "network",
	DATABASE = "database",
	VALIDATION = "validation",
	PERMISSION = "permission",
	NOT_FOUND = "not_found",
	TIMEOUT = "timeout",
	SYSTEM = "system",
	UNKNOWN = "unknown",
}

export interface ClassifiedError {
	type: ErrorType;
	severity: ErrorSeverity;
	message: string; // Technical message (for logging)
	userMessage: string; // User-friendly message
	recoverable: boolean;
	retryable: boolean;
	originalError?: unknown;
}

/**
 * Maps AppError variants to error types and severities
 */
const errorPatterns: Array<{
	pattern: RegExp | string;
	type: ErrorType;
	severity: ErrorSeverity;
	userMessage: string;
	retryable: boolean;
}> = [
	// Network errors
	{
		pattern: /network|fetch|connection|ECONNREFUSED|timeout/i,
		type: ErrorType.NETWORK,
		severity: ErrorSeverity.HIGH,
		userMessage:
			"Network connection failed. Please check your internet connection.",
		retryable: true,
	},
	{
		pattern: /unauthorized|401/i,
		type: ErrorType.PERMISSION,
		severity: ErrorSeverity.HIGH,
		userMessage: "Authentication failed. Please check your credentials.",
		retryable: false,
	},
	{
		pattern: /forbidden|403/i,
		type: ErrorType.PERMISSION,
		severity: ErrorSeverity.HIGH,
		userMessage: "Access denied. You don't have permission for this action.",
		retryable: false,
	},
	{
		pattern: /not found|404/i,
		type: ErrorType.NOT_FOUND,
		severity: ErrorSeverity.MEDIUM,
		userMessage: "Resource not found.",
		retryable: false,
	},
	{
		pattern: /server error|500|502|503/i,
		type: ErrorType.NETWORK,
		severity: ErrorSeverity.HIGH,
		userMessage: "Server error. Please try again later.",
		retryable: true,
	},

	// Database errors
	{
		pattern: /database|sql|query/i,
		type: ErrorType.DATABASE,
		severity: ErrorSeverity.HIGH,
		userMessage: "Failed to save data. Please try again.",
		retryable: true,
	},

	// Validation errors
	{
		pattern: /validation|invalid|format/i,
		type: ErrorType.VALIDATION,
		severity: ErrorSeverity.LOW,
		userMessage: "Invalid input. Please check your data.",
		retryable: false,
	},

	// Permission errors
	{
		pattern: /permission|denied|access/i,
		type: ErrorType.PERMISSION,
		severity: ErrorSeverity.MEDIUM,
		userMessage: "Permission denied. Please check system permissions.",
		retryable: false,
	},

	// Timeout errors
	{
		pattern: /timeout|timed out/i,
		type: ErrorType.TIMEOUT,
		severity: ErrorSeverity.MEDIUM,
		userMessage: "Operation timed out. Please try again.",
		retryable: true,
	},

	// System errors
	{
		pattern: /system|platform|os error/i,
		type: ErrorType.SYSTEM,
		severity: ErrorSeverity.HIGH,
		userMessage: "System error occurred. Please restart the application.",
		retryable: false,
	},
];

/**
 * Extracts error message from various error types
 */
function extractErrorMessage(error: unknown): string {
	if (typeof error === "string") {
		return error;
	}

	if (error instanceof Error) {
		return error.message;
	}

	if (error && typeof error === "object") {
		// Handle AppError format from Rust backend
		if ("error" in error && typeof error.error === "string") {
			return error.error;
		}

		// Handle standard error objects
		if ("message" in error && typeof error.message === "string") {
			return error.message;
		}
	}

	return "An unknown error occurred";
}

/**
 * Classifies an error and generates user-friendly message
 */
export function classifyError(error: unknown): ClassifiedError {
	const message = extractErrorMessage(error);

	// Match against known patterns
	for (const pattern of errorPatterns) {
		const matches =
			typeof pattern.pattern === "string"
				? message.includes(pattern.pattern)
				: pattern.pattern.test(message);

		if (matches) {
			return {
				type: pattern.type,
				severity: pattern.severity,
				message,
				userMessage: pattern.userMessage,
				recoverable:
					pattern.retryable || pattern.severity !== ErrorSeverity.CRITICAL,
				retryable: pattern.retryable,
				originalError: error,
			};
		}
	}

	// Unknown error fallback
	return {
		type: ErrorType.UNKNOWN,
		severity: ErrorSeverity.MEDIUM,
		message,
		userMessage: "Something went wrong. Please try again.",
		recoverable: true,
		retryable: true,
		originalError: error,
	};
}

/**
 * Helper to get user-friendly error message (backwards compatible with existing code)
 */
export function getErrorMessage(error: unknown): string {
	return classifyError(error).userMessage;
}
