export interface TResult<T> {
    data: T;
    messages: string[];
    success: boolean;
}