import Fs from "fs";

// Source
import * as Interface from "./Interface";

let pathLog: string | undefined = undefined;

export const setPathLog = (value: string | undefined) => {
    pathLog = value;
};

export const writeLog = (tag: string, value: string | boolean): void => {
    if (pathLog) {
        Fs.appendFile(pathLog, `${tag}: ${value.toString()}\n`, () => {
            // eslint-disable-next-line no-console
            console.log(`WriteLog => ${tag}: `, value);
        });
    }
};

export const objectOutput = (obj: unknown): string => {
    return JSON.stringify(obj, circularReplacer(), 2);
};

export const checkJson = (json: string) => {
    if (
        /^[\],:{}\s]*$/.test(
            json
                .replace(/\\["\\/bfnrtu]/g, "@")
                .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\\-]?\d+)?/g, "]")
                .replace(/(?:^|:|,)(?:\s*\[)+/g, "")
        )
    ) {
        return true;
    }

    return false;
};

export const keepProcess = () => {
    for (const event of ["uncaughtException", "unhandledRejection"]) {
        process.on(event, (error: Error) => {
            writeLog("@cimo/websocket - Helper.ts - keepProcess()", `Event: ${event} - Message: ${objectOutput(error.stack) || objectOutput(error)}`);
        });
    }
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
