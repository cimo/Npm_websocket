// Source
import * as Interface from "./Interface";

let debug: boolean | undefined = undefined;

export const setDebug = (value: boolean | undefined) => {
    debug = value;
};

export const writeLog = (tag: string, value: string | boolean): void => {
    if (debug) {
        // eslint-disable-next-line no-console
        console.log(`WriteLog => ${tag}: `, value);
    }
};

export const objectOutput = (obj: unknown): string => {
    return JSON.stringify(obj, circularReplacer(), 2);
};

const circularReplacer = (): Interface.IcircularReplacer => {
    const seen = new WeakSet();

    return (_key: string, value: string): string | null => {
        if (value !== null && typeof value === "object") {
            if (seen.has(value)) {
                return null;
            }

            seen.add(value);
        }

        return value;
    };
};
