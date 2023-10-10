export interface Imessage {
    date: string;
    tag: string;
    message: string;
}

export interface IcallbackReceiveMessage {
    (data: Imessage): void;
}
