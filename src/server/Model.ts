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
    lastPong: number;
}

export interface IcallbackHandleFrame {
    (clientOpCode: number, clientFragmentList: Buffer[]): void;
}

export interface IcallbackHandleResponse {
    (clientId: string, message: ThandleMessage): void;
}

export interface IcallbackReceiveUpload {
    (clientId: string, messageList: Buffer[], filename: string): void;
}

export interface Imessage {
    tag: string;
    data: string;
}

export type TsendMessage = string | Record<string, unknown> | Buffer;
export type ThandleMessage = string | Buffer[];
