// Source
import * as Interface from "./Interface";

export default class CwsClient {
    private serverAddress: string;
    private websocket: WebSocket | null;
    private timeoutReconnect: NodeJS.Timer | undefined;
    private receiveMessageHandleList: Map<string, (data: Interface.Imessage) => void>;

    constructor() {
        this.serverAddress = "";
        this.websocket = null;
        this.timeoutReconnect = undefined;
        this.receiveMessageHandleList = new Map();
    }

    connection = (address?: string) => {
        this.serverAddress = address ? address : this.serverAddress;

        this.websocket = new WebSocket(this.serverAddress);

        this.websocket.addEventListener("open", this.eventOpen);
        this.websocket.addEventListener("message", this.receiveMessageHandle);
        this.websocket.addEventListener("close", this.eventClose);
    };

    sendMessage = (tagValue: string, messageValue: string | Record<string, unknown>) => {
        const check = this.checkConnection();

        if (this.websocket && check) {
            const dataStructure = {
                date: new Date().toISOString(),
                tag: `cws_${tagValue}_o`,
                message: messageValue
            };

            this.websocket.send(JSON.stringify(dataStructure));
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

    private receiveMessageHandle = (event: MessageEvent) => {
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
            this.websocket.removeEventListener("message", this.receiveMessageHandle);
            this.websocket.removeEventListener("close", this.eventClose);

            this.websocket = null;

            this.timeoutReconnect = setTimeout(this.connection, 1000);
        }
    };
}
