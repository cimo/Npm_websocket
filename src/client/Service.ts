// Source
import * as Model from "./Model";

export default class CwsClient {
    private address: string;
    private ws: WebSocket | undefined;
    private clientId: string;
    private handleReceiveDataList: Map<string, Model.IcallbackReceiveMessage>;
    private countCheckConnection: number;
    private intervalCheckConnection: NodeJS.Timeout | undefined;
    private callbackCheckConnection: ((mode: string) => void) | undefined;
    private intervalReconnection: NodeJS.Timeout | undefined;
    private countCheckReconnection: number;
    private countCheckLimit: number;

    getClientId = (): string => {
        return this.clientId;
    };

    constructor(address: string, countCheckLimit = 25) {
        this.address = address;
        this.ws = undefined;
        this.clientId = "";
        this.handleReceiveDataList = new Map();
        this.countCheckConnection = 0;
        this.intervalCheckConnection = undefined;
        this.callbackCheckConnection = undefined;
        this.intervalReconnection = undefined;
        this.countCheckReconnection = 0;
        this.countCheckLimit = countCheckLimit;

        this.create();
    }

    sendData = (mode: number, data: string | ArrayBuffer, tag = "", timeout = 0): void => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (mode === 1) {
                const jsonMessage = {
                    tag: `cws_${tag}`,
                    data: typeof data === "string" ? window.btoa(String.fromCharCode.apply(null, Array.from(new TextEncoder().encode(data)))) : data
                } as Model.Imessage;

                if (timeout > 0) {
                    const timeoutEvent = setTimeout(() => {
                        clearTimeout(timeoutEvent);

                        this.ws?.send(JSON.stringify(jsonMessage));
                    }, timeout);
                } else {
                    this.ws.send(JSON.stringify(jsonMessage));
                }
            } else if (mode === 2) {
                this.ws.send(data);
            }
        } else {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Client => Service.ts => sendData()", "Client not connected.");
        }
    };

    sendDataUpload = (filename: string, file: ArrayBuffer): void => {
        this.sendData(1, filename, "upload");
        this.sendData(2, file);
    };

    sendDataBroadcast = (data: string): void => {
        this.sendData(1, data, "broadcast");
    };

    receiveData = (tag: string, callback: Model.IcallbackReceiveMessage): void => {
        this.handleReceiveDataList.set(`cws_${tag}`, (data) => {
            let resultData: string | DataView;

            if (typeof data === "string") {
                const decoded = window.atob(data);

                resultData = new TextDecoder("utf-8").decode(new Uint8Array([...decoded].map((c) => c.charCodeAt(0))));
            } else {
                resultData = data;
            }

            callback(resultData);
        });
    };

    receiveDataDownload = (callback: Model.IcallbackReceiveDownload): void => {
        let filename = "";

        this.receiveData("download", (data) => {
            if (typeof data === "string") {
                filename = data;
            } else {
                callback(data, filename);

                filename = "";
            }
        });
    };

    receiveDataOff = (tag: string): void => {
        if (this.handleReceiveDataList.has(`cws_${tag}`)) {
            this.handleReceiveDataList.delete(`cws_${tag}`);
        }
    };

    checkConnection = (callback: (mode: string) => void): void => {
        if (this.countCheckConnection > this.countCheckLimit) {
            clearInterval(this.intervalCheckConnection);

            return;
        }

        if (!this.callbackCheckConnection) {
            this.callbackCheckConnection = callback;
        }

        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                clearInterval(this.intervalCheckConnection);

                this.countCheckConnection = 0;

                this.callbackCheckConnection("connection");
            } else if (this.countCheckConnection === 0) {
                this.intervalCheckConnection = setInterval(() => {
                    this.countCheckConnection++;

                    this.checkConnection(callback);
                }, 3000);
            }
        }
    };

    checkReconnection = (mode: string): void => {
        if (this.countCheckReconnection > this.countCheckLimit) {
            clearInterval(this.intervalReconnection);

            return;
        }

        if (mode === "end") {
            clearInterval(this.intervalReconnection);

            this.countCheckReconnection = 0;

            if (this.callbackCheckConnection) {
                this.callbackCheckConnection("reconnection");
            }
        } else if (mode === "start" && this.countCheckReconnection === 0) {
            this.intervalReconnection = setInterval(() => {
                this.countCheckReconnection++;

                if (!this.ws) {
                    this.create();
                }
            }, 3000);
        }
    };

    private create = (): void => {
        this.ws = new WebSocket(this.address);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Client => Service.ts => onOpen()", "Connection open.");
        };

        let messageTagDownload = "";

        this.ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (this.ws) {
                if (typeof event.data === "string") {
                    const jsonMessage = JSON.parse(event.data) as Model.Imessage;

                    if (jsonMessage.tag === "cws_client_connection") {
                        if (!this.clientId) {
                            this.sendData(1, "", "client_connected");
                        } else {
                            this.sendData(1, "", "client_reconnection");

                            this.checkReconnection("end");
                        }

                        this.clientId = jsonMessage.data;
                    } else if (jsonMessage.tag === "cws_ping") {
                        this.sendData(1, "", "pong");
                    } else if (jsonMessage.tag === "cws_download") {
                        messageTagDownload = jsonMessage.tag;
                    }

                    this.handleReceiveData(jsonMessage.tag, jsonMessage.data);
                } else if (typeof event.data !== "string" && messageTagDownload) {
                    const view = new DataView(event.data);

                    this.handleReceiveData(messageTagDownload, view);

                    messageTagDownload = "";
                }
            }
        };

        this.ws.onclose = () => {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Client => Service.ts => onClose()", "Connection close.");

            this.cleanup();

            this.checkReconnection("start");
        };
    };

    private handleReceiveData = (tag: string, data: string | DataView): void => {
        for (const [index, callback] of this.handleReceiveDataList) {
            if (tag === index) {
                callback(data);

                return;
            }
        }
    };

    private cleanup = (): void => {
        this.ws = undefined;
    };
}
