import * as Http from "http";
import * as Https from "https";
import * as Net from "net";

export { Http as IhttpServer };
export { Https as IhttpsServer };

export interface Iclient {
    id: string;
    signature: string;
    username: string;
    socket: Net.Socket;
    buffer: Buffer;
    opCode: number;
    fragmentList: Buffer[];
    intervalPing: NodeJS.Timeout | undefined;
    lastPong: number;
}

export interface IhandleReceiveData {
    tag: string;
    callback: IcallbackReceiveData<TreceiveData>;
}

export interface IcallbackHandleFrame {
    (clientOpCode: number, clientFragmentList: Buffer[]): void;
}

export interface IcallbackReceiveData<T> {
    (data: T, clientId: string): void;
}

export interface IcallbackReceiveDataUpload {
    (dataList: Buffer[], filename: string, clientId: string): void;
}

export interface Imessage {
    tag: string;
    data: string;
}

export interface ImessageDirect {
    content: TsendData;
    toClientId: string;
}

export type TreceiveData = string | Buffer[];
export type TsendData = string | Record<string, unknown> | Buffer;
