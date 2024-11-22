import * as Http from "http";
import * as Https from "https";
import * as Net from "net";

export { Http as IhttpServer };
export { Https as IhttpsServer };

export interface Iclient {
    socket: Net.Socket;
    buffer: Buffer;
    signature: string;
    opCode: number;
    fragmentList: Buffer[];
    intervalPing: NodeJS.Timeout | undefined;
    lastAction: number;
}

export interface Imessage {
    tag: string;
    data: string;
}

export interface IcallbackReceiveMessage {
    (clientId: string, data: string | Buffer[]);
}

export interface IcallbackReceiveUpload {
    (clientId: string, data: Buffer[], filename: string);
}

export interface IcallbackHandleFrame {
    (clientOpCode: number, clientFragmentList: Buffer[]);
}
