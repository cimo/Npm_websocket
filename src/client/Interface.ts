export interface Imessage {
    date: string;
    tag: string;
    message: string;
}

export interface IcallbackReceiveMessage {
    (data: Imessage): void;
}

export interface IworkerMessage {
    action: string;
    time: number;
}
