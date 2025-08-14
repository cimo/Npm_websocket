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

export const base64ToUtf8 = (base64: string): string => {
    return decodeURIComponent(
        Array.prototype.map.call(window.atob(base64), (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
};
