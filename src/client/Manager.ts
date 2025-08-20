// Source
import * as helperSrc from "../HelperSrc";
import * as model from "./Model";

export default class Manager {
    private ws: WebSocket | undefined;
    private address: string;
    private handleReceiveDataList: model.IhandleReceiveData[];
    private clientIdCurrent: string;
    private callbackConnection: (() => void) | null;
    private callbackDisconnection: (() => void) | null;

    private handleReceiveData = (tag: string, data: model.TreceiveData): void => {
        for (const handleReceiveData of this.handleReceiveDataList) {
            if (handleReceiveData.tag === tag) {
                handleReceiveData.callback(data);

                break;
            }
        }
    };

    private handleReceiveDataRemove = (tag: string): void => {
        for (let a = this.handleReceiveDataList.length - 1; a >= 0; a--) {
            if (this.handleReceiveDataList[a].tag === tag) {
                this.handleReceiveDataList.splice(a, 1);
            }
        }
    };

    private cleanup = (): void => {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
    };

    private dataClientIdCurrent = () => {
        this.receiveData<model.TreceiveData>("clientId_current", (data) => {
            this.clientIdCurrent = data as string;
        });
    };

    private create = (): void => {
        this.ws = new WebSocket(this.address);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            helperSrc.writeLog("@cimo/websocket - Client - Manager.ts - create() - onopen()", "Connection open.");

            if (this.callbackConnection) {
                this.callbackConnection();
            }
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

                    this.handleReceiveData(messageObject.tag, messageObject.data);
                } else if (typeof event.data !== "string" && messageTagDownload) {
                    const view = new DataView(event.data);

                    this.handleReceiveData(messageTagDownload, view);

                    messageTagDownload = "";
                }
            }
        };

        this.ws.onclose = () => {
            helperSrc.writeLog("@cimo/websocket - Client - Manager.ts - create() - onclose()", "Connection close.");

            this.cleanup();

            if (this.callbackDisconnection) {
                this.callbackDisconnection();
            }
        };
    };

    constructor(addressValue: string) {
        this.ws = undefined;
        this.address = addressValue;
        this.handleReceiveDataList = [];
        this.clientIdCurrent = "";
        this.callbackConnection = null;
        this.callbackDisconnection = null;

        this.create();

        this.dataClientIdCurrent();
    }

    checkStatus = (mode: string, callback: () => void): void => {
        if (mode === "connection") {
            this.callbackConnection = callback;
        } else if (mode === "disconnection") {
            this.callbackDisconnection = callback;
        }
    };

    sendMessage = (mode: string, data: model.TsendData, tag = "", timeout = 0): void => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (!(data instanceof ArrayBuffer) && !(typeof data === "string") && !(typeof data === "object" && data !== null)) {
                helperSrc.writeLog("@cimo/websocket - Client - Manager.ts - sendMessage()", "Invalid data type!");
            }

            if (mode === "text" && !(data instanceof ArrayBuffer)) {
                let resultData = "";

                if (typeof data === "string") {
                    resultData = data;
                } else if (typeof data === "object") {
                    resultData = JSON.stringify(data);
                }

                const messageObject: model.Imessage = {
                    tag: `cws_${tag}`,
                    data: window.btoa(String.fromCharCode(...new TextEncoder().encode(resultData)))
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
            } else if (mode === "binary" && data instanceof ArrayBuffer) {
                this.ws.send(data);
            } else {
                helperSrc.writeLog("@cimo/websocket - Client - Manager.ts - sendMessage()", "Message type doesn't match mode!");
            }
        } else {
            helperSrc.writeLog("@cimo/websocket - Client - Manager.ts - sendMessage()", "Client not connected!");
        }
    };

    sendDataBroadcast = (data: model.TsendData): void => {
        this.sendMessage("text", data, "broadcast");
    };

    sendDataUpload = (filename: string, file: ArrayBuffer): void => {
        this.sendMessage("text", filename, "upload");
        this.sendMessage("binary", file, "", 100);
    };

    sendDataDirect = (dataValue: model.TsendData, clientId: string): void => {
        if (clientId !== "") {
            const data: model.ImessageDirect = {
                time: new Date().toISOString(),
                content: dataValue,
                fromClientId: this.clientIdCurrent,
                toClientId: clientId
            };

            this.sendMessage("text", data as unknown as Record<string, unknown>, "direct");
        }
    };

    receiveData = <T>(tag: string, callbackValue: model.IcallbackReceiveData<T>): void => {
        const cwsTag = `cws_${tag}`;

        this.handleReceiveDataRemove(cwsTag);

        this.handleReceiveDataList.push({
            tag: cwsTag,
            callback: (data) => {
                let resultData: T;

                if (typeof data === "string") {
                    const decoded = helperSrc.base64ToUtf8(data);

                    resultData = !helperSrc.isJson(decoded) ? (decoded as T) : (JSON.parse(decoded) as T);
                } else {
                    resultData = data as T;
                }

                callbackValue(resultData);
            }
        });
    };

    receiveDataDownload = (callback: model.IcallbackReceiveDataDownload): void => {
        let filename = "";

        this.receiveData<model.TreceiveData>("download", (data) => {
            if (typeof data === "string") {
                filename = data;
            } else {
                callback(data, filename);

                filename = "";
            }
        });
    };

    receiveDataDirect = (callback: (data: model.ImessageDirect) => void) => {
        this.receiveData<model.ImessageDirect>("direct", (data) => {
            callback(data);
        });
    };
}
