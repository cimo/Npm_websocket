// Source
import * as Interface from "./Interface";

export default class CwsClient {
    private clientId: string;
    private address: string;
    private ws: WebSocket | undefined;
    private handleReceiveDataList: Map<string, Interface.IcallbackReceiveMessage>;
    private countCheckConnection: number;
    private countCheckConnectionLimit: number;
    private intervalCheckConnection: NodeJS.Timeout | undefined;
    private callbackCheckConnection: (() => void) | undefined;

    getClientId = () => {
        return this.clientId;
    };

    constructor(address: string, countCheckConnectionLimit = 25) {
        this.clientId = "";
        this.address = address;
        this.ws = undefined;
        this.handleReceiveDataList = new Map();
        this.countCheckConnection = 0;
        this.countCheckConnectionLimit = countCheckConnectionLimit;
        this.intervalCheckConnection = undefined;
        this.callbackCheckConnection = undefined;

        this.create();
    }

    sendData = (mode: number, data: string | ArrayBuffer, tag = "") => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (mode === 1) {
                const json = {
                    tag: `cws_${tag}`,
                    message: data
                } as Interface.Imessage;

                this.ws.send(JSON.stringify(json));
            } else if (mode === 2) {
                this.ws.send(data);
            }
        } else {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Client - Service.ts - sendData()", "Client not connected.");
        }
    };

    sendDataBroadcast = (data: string) => {
        this.sendData(1, data, "broadcast");
    };

    sendDataUpload = (filename: string, data: ArrayBuffer) => {
        this.sendData(1, JSON.stringify({ filename }), "upload");
        this.sendData(2, data);
    };

    receiveData = (tag: string, callback: Interface.IcallbackReceiveMessage) => {
        this.handleReceiveDataList.set(`cws_${tag}`, (data) => {
            callback(data);
        });
    };

    receiveDataDownload = (callback: Interface.IcallbackReceiveDownload) => {
        let filename = "";

        this.receiveData("download", (data) => {
            if (typeof data === "string") {
                const message = JSON.parse(data) as Record<string, string>;

                filename = message.filename;
            } else {
                callback(data, filename);

                filename = "";
            }
        });
    };

    receiveDataOff = (tag: string) => {
        if (this.handleReceiveDataList.has(`cws_${tag}`)) {
            this.handleReceiveDataList.delete(`cws_${tag}`);
        }
    };

    checkConnection = (callback: () => void) => {
        if (this.countCheckConnection > this.countCheckConnectionLimit) {
            clearInterval(this.intervalCheckConnection);
        }

        if (!this.callbackCheckConnection) {
            this.callbackCheckConnection = callback;
        }

        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                clearInterval(this.intervalCheckConnection);
                this.intervalCheckConnection = undefined;

                this.countCheckConnection = 0;

                this.callbackCheckConnection();
            } else if (!this.intervalCheckConnection && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.CLOSED)) {
                this.intervalCheckConnection = setInterval(() => {
                    this.checkConnection(callback);
                }, 1000);
            }
        }
    };

    private create = () => {
        this.ws = new WebSocket(this.address);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Client - Service.ts - onOpen()", "Connection open.");
        };

        let messageTagDownload = "";

        this.ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (this.ws) {
                if (typeof event.data === "string") {
                    const json = JSON.parse(event.data) as Interface.Imessage;

                    if (json.tag === "cws_client_connection") {
                        this.clientId = json.message;
                    } else if (json.tag === "cws_download") {
                        messageTagDownload = json.tag;
                    }

                    this.handleReceiveData(json.tag, json.message);
                } else if (typeof event.data !== "string" && messageTagDownload) {
                    const view = new DataView(event.data);

                    this.handleReceiveData(messageTagDownload, view);

                    messageTagDownload = "";
                }
            }
        };

        this.ws.onclose = () => {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Client - Service.ts - onClose()", "Connection close.");

            this.cleanup();

            if (this.countCheckConnection < this.countCheckConnectionLimit) {
                this.countCheckConnection++;

                this.create();

                this.checkConnection(() => {
                    //...
                });
            }
        };
    };

    private handleReceiveData = (tag: string, data: string | DataView) => {
        for (const [index, callback] of this.handleReceiveDataList) {
            if (tag === index) {
                callback(data);

                return;
            }
        }
    };

    private cleanup = () => {
        this.clientId = "";
        this.ws = undefined;
    };
}
