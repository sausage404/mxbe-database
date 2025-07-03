import * as types from "./types";
export * from "./types";
import { DatabaseError } from "./errors";

export default class Database<T> {
    private data: Map<string, T>;

    constructor(
        private collectionName: string,
        private storageType: types.StorageType,
        private collectionValidators?: types.CollectionValidator<T>
    ) {
        if (collectionName.length < 1 || collectionName.length > 16) {
            throw new DatabaseError(
                'INVALID_COLLECTION_NAME',
                'Collection name must be between 1 and 16 characters',
                { collectionName, length: collectionName.length }
            );
        }
        this.data = new Map<string, T>();
        this.initialize();
    }

    private initialize(): void {
        try {
            const storedData = this.storageType.getDynamicProperty(this.collectionName) as string;
            if (storedData) {
                const entries = JSON.parse(storedData);
                for (const [id, data] of entries) {
                    if (this.validate(data)) {
                        this.data.set(id, data);
                    } else {
                        throw new DatabaseError(
                            'VALIDATION_FAILED',
                            `Invalid data found during initialization`,
                            { id, data }
                        );
                    }
                }
            }
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'INITIALIZATION_ERROR',
                'Failed to initialize database',
                { originalError: error.message }
            );
        }
    }

    private saveChanges(): void {
        try {
            const entries = Array.from(this.data.entries());
            this.storageType.setDynamicProperty(this.collectionName, JSON.stringify(entries));
        } catch (error) {
            throw new DatabaseError(
                'STORAGE_WRITE_ERROR',
                'Failed to save changes to storage',
                { originalError: error.message }
            );
        }
    }

    private generateId(): string {
        let attempts = 0;
        const maxAttempts = 100;
        let id: string;

        do {
            if (attempts >= maxAttempts) {
                throw new DatabaseError(
                    'DUPLICATE_KEY',
                    'Failed to generate unique ID after maximum attempts',
                    { attempts: maxAttempts }
                );
            }

            id = Array.from(
                { length: 16 },
                () => Math.floor(Math.random() * 16).toString(16)
            ).join('');

            attempts++;
        } while (this.data.has(id));

        return id;
    }

    private validate(data: T): boolean {
        if (!this.collectionValidators) return true;

        const validationErrors: Array<{ field: string; error: string }> = [];

        if (!this.collectionValidators) {
            return true;
        }

        for (const [key, validator] of Object.entries(this.collectionValidators)) {
            if (!validator) continue;

            if (!(validator as (value: T[keyof T]) => boolean)(data[key as keyof T])) {
                validationErrors.push({
                    field: key,
                    error: `Validation failed for field ${key}`
                });
            }
        }

        if (validationErrors.length > 0) {
            throw new DatabaseError(
                'VALIDATION_FAILED',
                'Data validation failed',
                { validationErrors }
            );
        }

        return true;
    }

    private evaluateCondition(data: T, condition: types.FilterCondition<T>): boolean {
        try {
            const value = data[condition.field];
            const conditionValue = condition.value;

            switch (condition.operator) {
                case '==': return value === conditionValue;
                case '!=': return value !== conditionValue;
                case '>': return value > conditionValue;
                case '<': return value < conditionValue;
                case '>=': return value >= conditionValue;
                case '<=': return value <= conditionValue;
                case 'contains':
                    return String(value).toLowerCase().includes(String(conditionValue).toLowerCase());
                case 'startsWith':
                    return String(value).toLowerCase().startsWith(String(conditionValue).toLowerCase());
                case 'endsWith':
                    return String(value).toLowerCase().endsWith(String(conditionValue).toLowerCase());
                default:
                    throw new DatabaseError(
                        'INVALID_QUERY',
                        'Invalid operator in filter condition',
                        { operator: condition.operator }
                    );
            }
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'INVALID_QUERY',
                'Error evaluating filter condition',
                { condition, originalError: error.message }
            );
        }
    }

    public clear(): void {
        try {
            this.data.clear();
            this.saveChanges();
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'STORAGE_WRITE_ERROR',
                'Failed to clear database',
                { originalError: error.message }
            );
        }
    }

    public create(data: T): string {
        try {
            this.validate(data);
            const id = this.generateId();
            this.data.set(id, data);
            this.saveChanges();
            return id;
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'UNKNOWN_ERROR',
                'Failed to create document',
                { originalError: error.message }
            );
        }
    }

    public createMany(items: T[]): string[] {
        try {
            const ids: string[] = [];

            // Validate all items first
            items.forEach((item, index) => {
                try {
                    this.validate(item);
                } catch (error) {
                    throw new DatabaseError(
                        'VALIDATION_FAILED',
                        `Validation failed for item at index ${index}`,
                        { index, item, originalError: error }
                    );
                }
            });

            // Create all items
            items.forEach(item => {
                const id = this.generateId();
                this.data.set(id, item);
                ids.push(id);
            });

            this.saveChanges();
            return ids;
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'UNKNOWN_ERROR',
                'Failed to create multiple documents',
                { originalError: error.message }
            );
        }
    }

    public update(id: string, data: Partial<T>): void {
        const existingData = this.data.get(id);
        if (!existingData) {
            throw new DatabaseError(
                'DOCUMENT_NOT_FOUND',
                'Document not found for update',
                { id }
            );
        }

        const updatedData = { ...existingData, ...data } as T;

        try {
            this.validate(updatedData);
            this.data.set(id, updatedData);
            this.saveChanges();
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'INVALID_UPDATE',
                'Failed to update document',
                { id, originalError: error.message }
            );
        }
    }

    public updateMany(updates: Array<{ id: string; data: Partial<T> }>): void {
        const originalData = new Map(this.data);
        try {

            // Validate all updates first
            updates.forEach(({ id, data }, index) => {
                const existingData = this.data.get(id);
                if (!existingData) {
                    throw new DatabaseError(
                        'DOCUMENT_NOT_FOUND',
                        `Document not found for update at index ${index}`,
                        { index, id }
                    );
                }

                const updatedData = { ...existingData, ...data } as T;
                try {
                    this.validate(updatedData);
                } catch (error) {
                    throw new DatabaseError(
                        'VALIDATION_FAILED',
                        `Validation failed for update at index ${index}`,
                        { index, id, data, originalError: error }
                    );
                }
            });

            // Apply all updates
            updates.forEach(({ id, data }) => {
                const existingData = this.data.get(id)!;
                this.data.set(id, { ...existingData, ...data } as T);
            });

            this.saveChanges();
        } catch (error) {
            // Rollback on error
            this.data = originalData;

            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'INVALID_UPDATE',
                'Failed to update multiple documents',
                { originalError: error.message }
            );
        }
    }

    public delete(id: string): void {
        if (!this.data.has(id)) {
            throw new DatabaseError(
                'DOCUMENT_NOT_FOUND',
                'Document not found for deletion',
                { id }
            );
        }

        try {
            this.data.delete(id);
            this.saveChanges();
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'STORAGE_WRITE_ERROR',
                'Failed to delete document',
                { id, originalError: error.message }
            );
        }
    }

    public deleteMany(ids: string[]): void {
        const originalData = new Map(this.data);
        try {
            // Verify all IDs exist first
            ids.forEach((id, index) => {
                if (!this.data.has(id)) {
                    throw new DatabaseError(
                        'DOCUMENT_NOT_FOUND',
                        `Document not found for deletion at index ${index}`,
                        { index, id }
                    );
                }
            });

            // Delete all documents
            ids.forEach(id => this.data.delete(id));
            this.saveChanges();
        } catch (error) {
            // Rollback on error
            this.data = originalData;

            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'STORAGE_WRITE_ERROR',
                'Failed to delete multiple documents',
                { originalError: error.message }
            );
        }
    }

    public findById(id: string): { id: string; data: T } {
        const data = this.data.get(id);
        if (!data) {
            throw new DatabaseError(
                'DOCUMENT_NOT_FOUND',
                'Document not found',
                { id }
            );
        }
        return { id, data };
    }

    public findOne(predicate: (value: T) => boolean): { id: string; data: T } {
        try {
            const result = this.findMany(predicate)[0];
            if (!result) {
                throw new DatabaseError(
                    'DOCUMENT_NOT_FOUND',
                    'No document found matching predicate'
                );
            }
            return result;
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'INVALID_QUERY',
                'Error executing findOne query',
                { originalError: error.message }
            );
        }
    }

    public findMany(predicate?: (value: T) => boolean): Array<{ id: string; data: T }> {
        try {
            if (predicate) {
                return Array.from(this.data.entries())
                    .filter(([_, data]) => predicate(data))
                    .map(([id, data]) => ({ id, data }));
            }
            return Array.from(this.data.entries())
                .map(([id, data]) => ({ id, data }));
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'INVALID_QUERY',
                'Error executing findMany query',
                { originalError: error.message }
            );
        }
    }

    public findLike(term: string, fields?: (keyof T)[]): Array<{ id: string; data: T }> {
        try {
            const lowerCaseTerm = term.toLowerCase();
            return Array.from(this.data.entries())
                .filter(([_, data]) => {
                    const searchFields = fields || Object.keys(data);
                    return searchFields.some(field => {
                        try {
                            return String(data[field as keyof T])
                                .toLowerCase()
                                .includes(lowerCaseTerm);
                        } catch {
                            return false;
                        }
                    });
                })
                .map(([id, data]) => ({ id, data }));
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'INVALID_QUERY',
                'Error executing findLike query',
                { term, fields, originalError: error.message }
            );
        }
    }

    public query(conditions: types.FilterCondition<T>[], sort?: types.SortOptions<T>, limit?: number): Array<{ id: string; data: T }> {
        try {
            if (!Array.isArray(conditions)) {
                throw new DatabaseError(
                    'INVALID_QUERY',
                    'Conditions must be an array',
                    { conditions }
                );
            }

            let results = Array.from(this.data.entries())
                .filter(([_, data]) =>
                    conditions.every(condition => this.evaluateCondition(data, condition))
                );

            if (sort) {
                const sortEntries = Object.entries(sort);
                results.sort(([_aId, a], [_bId, b]) => {
                    for (const [field, direction] of sortEntries) {
                        const aVal = a[field as keyof T];
                        const bVal = b[field as keyof T];
                        if (aVal === bVal) continue;

                        const comparison = aVal < bVal ? -1 : 1;
                        return direction === 'asc' ? comparison : -comparison;
                    }
                    return 0;
                });
            }

            if (limit !== undefined) {
                if (limit < 0) {
                    throw new DatabaseError(
                        'INVALID_QUERY',
                        'Limit must be a non-negative number',
                        { limit }
                    );
                }
                results = results.slice(0, limit);
            }

            return results.map(([id, data]) => ({ id, data }));
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'INVALID_QUERY',
                'Query execution failed',
                { conditions, sort, limit, originalError: error.message }
            );
        }
    }

    public export(): string {
        try {
            return JSON.stringify(Array.from(this.data.entries()));
        } catch (error) {
            throw new DatabaseError(
                'EXPORT_ERROR',
                'Failed to export database',
                { originalError: error.message }
            );
        }
    }

    public import(data: string): void {
        try {
            const entries = JSON.parse(data);
            const validEntries = entries.filter(([_, value]: [string, T]) => {
                try {
                    return this.validate(value);
                } catch (error) {
                    return false;
                }
            });

            if (validEntries.length !== entries.length) {
                throw new DatabaseError(
                    'VALIDATION_FAILED',
                    'Some entries failed validation during import',
                    {
                        totalEntries: entries.length,
                        validEntries: validEntries.length,
                        invalidEntries: entries.length - validEntries.length
                    }
                );
            }

            this.clear();
            for (const [id, value] of validEntries) {
                this.data.set(id, value);
            }
            this.saveChanges();

        } catch (error) {
            if (error instanceof DatabaseError) {
                throw error;
            }
            throw new DatabaseError(
                'IMPORT_ERROR',
                'Failed to import data',
                { originalError: error.message }
            );
        }
    }
}