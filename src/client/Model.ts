export interface Iclient {
    socket: WebSocket;
}

export interface IhandleReceiveData {
    tag: string;
    callback: IcallbackReceiveData<TreceiveData>;
}

export interface IcallbackReceiveData<T> {
    (data: T): void;
}

export interface IcallbackReceiveDataDownload {
    (data: DataView, filename: string): void;
}

export interface Imessage {
    tag: string;
    data: string;
}

export interface ImessageDirect {
    time: string;
    content: TsendData;
    fromClientId: string;
    toClientId: string;
}

export type TreceiveData = string | DataView;
export type TsendData = string | Record<string, unknown> | ArrayBuffer;
