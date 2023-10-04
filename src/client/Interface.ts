export interface IcircularReplacer {
    (key: string, value: string): string | null;
}

export interface Imessage {
    date: string;
    tag: string;
    message: string;
}

export interface IcallbackReadMessage {
    (data: Imessage): void;
}
