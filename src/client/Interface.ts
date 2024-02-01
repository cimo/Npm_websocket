export interface Iclient {
    socket: WebSocket;
}

export interface Imessage {
    tag: string;
    message: string;
}

export interface IcallbackReceiveMessage {
    (data: string | DataView);
}
