export interface Iclient {
    socket: WebSocket;
}

export interface IcallbackHandleResponse {
    (message: ThandleMessage): void;
}

export interface IcallbackReceiveDataDownload {
    (message: DataView, filename: string): void;
}

export interface Imessage {
    tag: string;
    data: string;
}

export type TsendMessage = string | Record<string, unknown> | ArrayBuffer;
export type ThandleMessage = string | DataView;
