import * as mc from "@minecraft/server";

export type StorageType = mc.World | mc.Entity | mc.Player | mc.ItemStack;
export type CollectionValidator<T> = { [K in keyof T]: (value: T[K]) => boolean };
export type SortDirection = 'asc' | 'desc';
export type SortOptions<T> = { [K in keyof T]?: SortDirection };
export type FilterOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith' | 'endsWith';
export type FilterCondition<T> = {
    field: keyof T;
    operator: FilterOperator;
    value: any;
}