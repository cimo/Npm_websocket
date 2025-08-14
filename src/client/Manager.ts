// Source
import * as helperSrc from "../HelperSrc";
import * as model from "./Model";

export default class Manager {
    private ws: WebSocket | undefined;
    private address: string;
    private clientId: string;
    private callbackHandleResponseMap: Map<string, model.IcallbackHandleResponse>;
    private countCheckConnection: number;
    private countCheckConnectionLimit: number;
    private intervalCheckConnection: NodeJS.Timeout | undefined;

    private handleResponse = (tag: string, message: model.ThandleMessage): void => {
        for (const [index, callback] of this.callbackHandleResponseMap) {
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
            helperSrc.writeLog("@cimo/websocket - Client - Manager.ts - create() - onOpen()", "Connection open.");
        };

        let messageTagDownload = "";

        this.ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (this.ws) {
                if (typeof event.data === "string") {
                    const eventData = event.data as string;

                    if (!eventData.trim()) {
                        return;
                    }

                    if (!helperSrc.isJson(eventData)) {
                        return;
                    }

                    const messageObject: model.Imessage = JSON.parse(eventData);

                    if (!messageObject || typeof messageObject.tag !== "string") {
                        return;
                    }

                    if (messageObject.tag === "cws_download") {
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
            helperSrc.writeLog("@cimo/websocket - Client - Manager.ts - create() - onClose()", "Connection close.");

            this.cleanup();
        };
    };

    constructor(addressValue: string, countCheckConnectionLimitValue = 25) {
        this.ws = undefined;
        this.address = addressValue;
        this.clientId = "";
        this.callbackHandleResponseMap = new Map();
        this.countCheckConnection = 0;
        this.countCheckConnectionLimit = countCheckConnectionLimitValue;
        this.intervalCheckConnection = undefined;

        this.create();
    }

    getClientId = (): string => {
        return this.clientId;
    };

    sendData = (mode: string, message: model.TsendMessage, tag = "", timeout = 0): void => {
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

                const messageObject: model.Imessage = {
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
        this.callbackHandleResponseMap.set(`cws_${tag}`, (message) => {
            let resultMessage: T;

            if (typeof message === "string") {
                const decoded = helperSrc.base64ToUtf8(message);

                if (!helperSrc.isJson(decoded)) {
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

    receiveDataDownload = (callback: model.IcallbackReceiveDataDownload): void => {
        let filename = "";

        this.receiveData("download", (message: model.ThandleMessage) => {
            if (typeof message === "string") {
                filename = message;
            } else {
                callback(message, filename);

                filename = "";
            }
        });
    };

    receiveDataOff = (tag: string): void => {
        if (this.callbackHandleResponseMap.has(`cws_${tag}`)) {
            this.callbackHandleResponseMap.delete(`cws_${tag}`);
        }
    };

    sendDataBroadcast = (message: model.TsendMessage): void => {
        this.sendData("text", message, "broadcast");
    };

    checkConnection = (callback: () => void): void => {
        if (this.countCheckConnection > this.countCheckConnectionLimit) {
            clearInterval(this.intervalCheckConnection);

            return;
        }

        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                clearInterval(this.intervalCheckConnection);

                this.countCheckConnection = 0;

                callback();
            } else if (this.countCheckConnection === 0) {
                this.intervalCheckConnection = setInterval(() => {
                    this.countCheckConnection++;

                    this.checkConnection(callback);
                }, 5000);
            }
        }
    };
}
