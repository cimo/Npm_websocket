// Source
import * as Interface from "./Interface";

export default class CwsClient {
    //private SEVEN_BITS_INTEGER_MARKER: number;
    //private SIXTEEN_BITS_INTEGER_MARKER: number;

    private serverAddress: string;
    private websocket: WebSocket | null;
    private timeoutReconnect: NodeJS.Timer | undefined;
    private receiveMessageHandleList: Map<string, (data: Interface.Imessage) => void>;

    constructor() {
        //this.SEVEN_BITS_INTEGER_MARKER = 125;
        //this.SIXTEEN_BITS_INTEGER_MARKER = 126;

        this.serverAddress = "";
        this.websocket = null;
        this.timeoutReconnect = undefined;
        this.receiveMessageHandleList = new Map();
    }

    connection = (address?: string) => {
        this.serverAddress = address ? address : this.serverAddress;
        this.websocket = new WebSocket(this.serverAddress);

        this.websocket.addEventListener("open", this.eventOpen);
        this.websocket.addEventListener("message", this.eventReceiveMessageHandle);
        this.websocket.addEventListener("close", this.eventClose);

        this.receiveMessage("ping", () => {
            this.sendMessage("pong", "ok");
        });
    };

    sendMessage = (tagValue: string, messageValue: string | Record<string, unknown>) => {
        const check = this.checkConnection();

        if (this.websocket && check) {
            const dataStructure = {
                date: new Date().toISOString(),
                tag: `cws_${tagValue}_o`,
                message: messageValue
            };

            const result = JSON.stringify(dataStructure);

            this.websocket.send(result);
        }
    };

    receiveMessage = (tag: string, callback: Interface.IcallbackReceiveMessage) => {
        this.receiveMessageHandleList.set(`cws_${tag}_i`, (data) => {
            callback(data);

            return;
        });
    };

    receiveMessageOff = (tag: string) => {
        if (this.receiveMessageHandleList.has(`cws_${tag}_i`)) {
            this.receiveMessageHandleList.delete(`cws_${tag}_i`);
        }
    };

    checkConnection = () => {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            return true;
        }

        // eslint-disable-next-line no-console
        console.log("@cimo/websocket - Service.ts - checkConnection():", "Server not ready.");

        return false;
    };

    private eventOpen = () => {
        // eslint-disable-next-line no-console
        console.log("@cimo/websocket - Service.ts - eventOpen():", "Connected.");

        clearTimeout(this.timeoutReconnect);
    };

    private eventReceiveMessageHandle = (event: MessageEvent) => {
        const data = JSON.parse(event.data as string) as Interface.Imessage;

        for (const [tag, callback] of this.receiveMessageHandleList) {
            if (tag === data.tag) {
                callback(data);

                return;
            }
        }
    };

    private eventClose = () => {
        if (this.websocket) {
            // eslint-disable-next-line no-console
            console.log("@cimo/websocket - Service.ts - eventClose():", "Disconnected. Try to reconnect...");

            this.websocket.removeEventListener("open", this.eventOpen);
            this.websocket.removeEventListener("message", this.eventReceiveMessageHandle);
            this.websocket.removeEventListener("close", this.eventClose);

            this.websocket = null;

            this.timeoutReconnect = setTimeout(this.connection, 1000);
        }
    };
}

/*private prepareMessage = (data: string) => {
    const encoder = new TextEncoder();
    const message = encoder.encode(data);
    const messageSize = message.length;

    let dataBuffer: Uint8Array;

    const firstByte = 0x80 | 0x01;

    if (messageSize <= this.SEVEN_BITS_INTEGER_MARKER) {
        const bytes = new Uint8Array([firstByte]);

        dataBuffer = new Uint8Array([...bytes, messageSize]);
    } else if (messageSize <= 2 ** 16) {
        const target = new Uint8Array(4);

        target[0] = firstByte;
        target[1] = this.SIXTEEN_BITS_INTEGER_MARKER | 0x0;

        new DataView(target.buffer).setUint16(2, messageSize);

        dataBuffer = target;
    } else {
        throw new Error("@cimo/websocket - Service.ts - prepareMessage - Error: Message too long.");
    }

    const totalLength = dataBuffer.byteLength + messageSize;

    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const buffer of [dataBuffer, message]) {
        result.set(buffer, offset);
        offset += buffer.length;
    }

    return result;
};*/
