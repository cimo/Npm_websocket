export interface Iclient {
    socket: WebSocket;
}

export interface Imessage {
    tag: string;
    data: string;
}

export interface Ifile {
    filename: string;
}

export interface IcallbackReceiveMessage {
    (data: string | DataView);
}

export interface IcallbackReceiveDownload {
    (data: DataView, filename: string);
}
