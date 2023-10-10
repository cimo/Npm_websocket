import { Socket } from "net";
import { Server } from "https";

export { Socket as Isocket };
export { Server as HttpsServer };

export interface Imessage {
    date: string;
    tag: string;
    message: string;
}

export interface IcallbackReceiveOutput {
    (socket: Socket, data: Imessage): void;
}
