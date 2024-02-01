// Source
import * as Interface from "./Interface";

export default class CwsClient {
    clientId: string;

    private address: string;
    private ws: WebSocket | undefined;
    private handleReceiveDataList: Map<string, Interface.IcallbackReceiveMessage>;

    constructor(address: string) {
        this.clientId = "";

        this.address = address;
        this.ws = undefined;
        this.handleReceiveDataList = new Map();

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
        }
    };

    sendDataBroadcast = (data: string) => {
        this.sendData(1, data, "broadcast");
    };

    receiveData = (tag: string, callback: Interface.IcallbackReceiveMessage) => {
        this.handleReceiveDataList.set(`cws_${tag}`, (data) => {
            callback(data);
        });
    };

    receiveDataOff = (tag: string) => {
        if (this.handleReceiveDataList.has(`cws_${tag}`)) {
            this.handleReceiveDataList.delete(`cws_${tag}`);
        }
    };

    private create = () => {
        this.ws = new WebSocket(this.address);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Client - Service.ts - onopen()", "Connection open.");
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
            console.log("@cimo/webSocket - Client - Service.ts - onclose()", "Connection close.");

            this.cleanup();
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
        this.address = "";
        this.ws = undefined;
        this.clientId = "";
    };
}
