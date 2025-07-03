export type DatabaseErrorType =
    | 'VALIDATION_FAILED'
    | 'INVALID_COLLECTION_NAME'
    | 'STORAGE_READ_ERROR'
    | 'STORAGE_WRITE_ERROR'
    | 'SERIALIZATION_ERROR'
    | 'DOCUMENT_NOT_FOUND'
    | 'DUPLICATE_KEY'
    | 'INVALID_UPDATE'
    | 'INVALID_QUERY'
    | 'INITIALIZATION_ERROR'
    | 'IMPORT_ERROR'
    | 'EXPORT_ERROR'
    | 'UNKNOWN_ERROR';

export class DatabaseError extends Error {
    constructor(
        readonly type: DatabaseErrorType,
        message: string,
        readonly details?: any
    ) {
        super(message);

        Object.setPrototypeOf(this, DatabaseError.prototype);

        if (typeof (Error as any).captureStackTrace === 'function') {
            (Error as any).captureStackTrace(this, DatabaseError);
        }

        this.name = 'DatabaseError';
    }

    toString(): string {
        let result = `${this.name}[${this.type}]: ${this.message}`;
        if (this.details) {
            result += `\nDetails: ${JSON.stringify(this.details, null, 2)}`;
        }
        return result;
    }

    toObject(): Record<string, any> {
        return {
            name: this.name,
            type: this.type,
            message: this.message,
            details: this.details,
            stack: this.stack
        };
    }
}