export const writeLog = (tag: string, value: string | Record<string, unknown> | Error): void => {
    // eslint-disable-next-line no-console
    console.log(`WriteLog => ${tag}: `, value);
};

export const isJson = (value: string): boolean => {
    try {
        JSON.parse(value);

        return true;
    } catch {
        return false;
    }
};
