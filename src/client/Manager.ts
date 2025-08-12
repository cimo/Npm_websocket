// Source
import * as HelperSrc from "../HelperSrc";
import * as Model from "./Model";

export default class Manager {
    private ws: WebSocket | undefined;
    private address: string;
    private clientId: string;
    private handleResponseMap: Map<string, Model.IcallbackHandleResponse>;
    private countCheckConnection: number;
    private intervalCheckConnection: NodeJS.Timeout | undefined;
    private callbackCheckConnection: ((mode: string) => void) | undefined;
    private countCheckReconnection: number;
    private countCheckLimit: number;
    private intervalReconnection: NodeJS.Timeout | undefined;

    private handleResponse = (tag: string, message: Model.ThandleMessage): void => {
        for (const [index, callback] of this.handleResponseMap) {
            if (tag === index) {
                callback(message);

                return;
            }
        }
    };

    private cleanup = (): void => {
        this.ws = undefined;
    };

    private create = (): void => {
        this.ws = new WebSocket(this.address);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            HelperSrc.writeLog("@cimo/websocket - Client - Manager.ts - create() - onOpen()", "Connection open.");
        };

        let messageTagDownload = "";

        this.ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (this.ws) {
                if (typeof event.data === "string") {
                    const messageObject: Model.Imessage = JSON.parse(event.data);

                    if (messageObject.tag === "cws_client_connection") {
                        if (!this.clientId) {
                            this.sendData("text", "", "client_connected");
                        } else {
                            this.sendData("text", "", "client_reconnection");

                            this.checkReconnection("end");
                        }

                        this.clientId = messageObject.data;
                    } else if (messageObject.tag === "cws_download") {
                        messageTagDownload = messageObject.tag;
                    }

                    this.handleResponse(messageObject.tag, messageObject.data);
                } else if (typeof event.data !== "string" && messageTagDownload) {
                    const view = new DataView(event.data);

                    this.handleResponse(messageTagDownload, view);

                    messageTagDownload = "";
                }
            }
        };

        this.ws.onclose = () => {
            HelperSrc.writeLog("@cimo/websocket - Client - Manager.ts - create() - onClose()", "Connection close.");

            this.cleanup();

            this.checkReconnection("start");
        };
    };

    constructor(addressValue: string, countCheckLimitValue = 25) {
        this.ws = undefined;
        this.address = addressValue;
        this.clientId = "";
        this.handleResponseMap = new Map();
        this.countCheckConnection = 0;
        this.intervalCheckConnection = undefined;
        this.callbackCheckConnection = undefined;
        this.countCheckReconnection = 0;
        this.countCheckLimit = countCheckLimitValue;
        this.intervalReconnection = undefined;

        this.create();
    }

    getClientId = (): string => {
        return this.clientId;
    };

    sendData = (mode: string, message: Model.TsendMessage, tag = "", timeout = 0): void => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (!(message instanceof ArrayBuffer) && !(typeof message === "string") && !(typeof message === "object" && message !== null)) {
                throw new Error("@cimo/websocket - Client - Manager.ts - sendData() => Invalid message type!");
            }

            if (mode === "text" && !(message instanceof ArrayBuffer)) {
                let resultMessage = "";

                if (typeof message === "string") {
                    resultMessage = message;
                } else if (typeof message === "object") {
                    resultMessage = JSON.stringify(message);
                }

                const messageObject: Model.Imessage = {
                    tag: `cws_${tag}`,
                    data: window.btoa(String.fromCharCode(...new TextEncoder().encode(resultMessage)))
                };

                if (timeout > 0) {
                    const timeoutEvent = setTimeout(() => {
                        clearTimeout(timeoutEvent);

                        if (this.ws) {
                            this.ws.send(JSON.stringify(messageObject));
                        }
                    }, timeout);
                } else {
                    this.ws.send(JSON.stringify(messageObject));
                }
            } else if (mode === "binary" && message instanceof ArrayBuffer) {
                this.ws.send(message);
            } else {
                throw new Error("@cimo/websocket - Client - Manager.ts - sendData() => Message type doesn't match mode!");
            }
        } else {
            throw new Error("@cimo/websocket - Client - Manager.ts - sendData() => Client not connected!");
        }
    };

    receiveData = <T>(tag: string, callback: (message: T) => void): void => {
        this.handleResponseMap.set(`cws_${tag}`, (message) => {
            let resultMessage: T;

            if (typeof message === "string") {
                const decoded = window.atob(message);

                if (!HelperSrc.isJson(decoded)) {
                    resultMessage = decoded as T;
                } else {
                    resultMessage = JSON.parse(decoded) as T;
                }
            } else {
                resultMessage = message as T;
            }

            callback(resultMessage);
        });
    };

    sendDataUpload = (filename: string, file: ArrayBuffer): void => {
        this.sendData("text", filename, "upload");
        this.sendData("binary", file, "", 100);
    };

    receiveDataDownload = (callback: Model.IcallbackReceiveDownload): void => {
        let filename = "";

        this.receiveData("download", (message: Model.ThandleMessage) => {
            if (typeof message === "string") {
                filename = message;
            } else {
                callback(message, filename);

                filename = "";
            }
        });
    };

    receiveDataOff = (tag: string): void => {
        if (this.handleResponseMap.has(`cws_${tag}`)) {
            this.handleResponseMap.delete(`cws_${tag}`);
        }
    };

    sendDataBroadcast = (message: Model.TsendMessage): void => {
        this.sendData("text", message, "broadcast");
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
                }, 5000);
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
            }, 5000);
        }
    };
}
