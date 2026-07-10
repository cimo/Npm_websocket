export const writeLog = (tag: string, value: string | Record<string, unknown> | Error): void => {
    // eslint-disable-next-line no-console
    console.log(`WriteLog => ${tag}: `, value);
};

export const jsonCheck = (value: string): boolean => {
    try {
        JSON.parse(value);

        return true;
    } catch {
        return false;
    }
};

export const base64ToUtf8 = (base64: string): string => {
    const decoded = window.atob(base64);
    let encoded = "";

    for (let a = 0; a < decoded.length; a++) {
        encoded += "%" + ("00" + decoded.charCodeAt(a).toString(16)).slice(-2);
    }

    return decodeURIComponent(encoded);
};
