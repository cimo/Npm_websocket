import { Server } from "https";
import * as Net from "net";

export { Server as IhttpsServer };

export interface Iclient {
    socket: Net.Socket;
    buffer: Buffer;
    opCode: number;
    fragmentList: Buffer[];
    intervalPing: NodeJS.Timeout | undefined;
}

export interface Imessage {
    tag: string;
    message: string;
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
