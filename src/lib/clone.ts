export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
