import { TResult } from "@src/core/dto/TResult";

export const createTResult = <T>(data: T, message: string[] = [], ): TResult<T> => {
    const hasMessage = message.length > 0;
    const success = !hasMessage;

    return {
        data,
        messages: hasMessage ? message : ["Success"],
        success
    }

}