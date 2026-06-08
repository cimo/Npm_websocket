// Source
import * as helperSrc from "../HelperSrc.js";
import * as model from "./Model.js";

export default class Manager {
    private ws: WebSocket | undefined;
    private address: string;
    private handleReceiveDataList: model.IhandleReceiveData[];
    private clientIdCurrent: string;
    private callbackConnection: (() => void) | undefined;
    private callbackDisconnection: (() => void) | undefined;

    private handleReceiveData = (tag: string, data: model.TreceiveData): void => {
        for (let a = 0; a < this.handleReceiveDataList.length; a++) {
            const handleReceiveData = this.handleReceiveDataList[a];

            if (handleReceiveData.tag === tag) {
                handleReceiveData.callback(data);

                break;
            }
        }
    };

    private handleReceiveDataDelete = (tag: string): void => {
        for (let a = this.handleReceiveDataList.length - 1; a >= 0; a--) {
            if (this.handleReceiveDataList[a].tag === tag) {
                this.handleReceiveDataList.splice(a, 1);
            }
        }
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

        this.ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
            if (this.ws) {
                if (typeof event.data === "string") {
                    const eventData = event.data;

                    if (eventData.trim() === "") {
                        return;
                    }

                    if (!helperSrc.isJson(eventData)) {
                        return;
                    }

                    const eventDataObject = JSON.parse(eventData) as model.Imessage;

                    if (!eventDataObject || typeof eventDataObject.tag !== "string") {
                        return;
                    }

                    if (eventDataObject.tag === "cws_clientId_current") {
                        this.clientIdCurrent = helperSrc.base64ToUtf8(eventDataObject.data);
                    }

                    if (eventDataObject.tag === "cws_download") {
                        messageTagDownload = eventDataObject.tag;
                    }

                    this.handleReceiveData(eventDataObject.tag, eventDataObject.data);
                } else if (typeof event.data !== "string" && messageTagDownload) {
                    const dataView = new DataView(event.data);

                    this.handleReceiveData(messageTagDownload, dataView);

                    messageTagDownload = "";
                }
            }
        };

        this.ws.onclose = () => {
            helperSrc.writeLog("@cimo/websocket - Client - Manager.ts - create() - onclose()", "Connection close.");

            this.ws = undefined;

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
        this.callbackConnection = undefined;
        this.callbackDisconnection = undefined;
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

                const encodedBytes = new TextEncoder().encode(resultData);
                let binaryString = "";

                for (let a = 0; a < encodedBytes.length; a++) {
                    binaryString += String.fromCharCode(encodedBytes[a]);
                }

                const messageObject: model.Imessage = {
                    tag: `cws_${tag}`,
                    data: window.btoa(binaryString)
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

    sendDataUpload = (mimeType: string, fileName: string, file: ArrayBuffer): void => {
        this.sendMessage("text", { mimeType, fileName }, "upload");
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

        this.handleReceiveDataDelete(cwsTag);

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
        let mimeType = "";
        let fileName = "";

        this.receiveData<model.TreceiveDataDownalod>("download", (data) => {
            if (data instanceof DataView) {
                callback(data, mimeType, fileName);

                mimeType = "";
                fileName = "";
            } else {
                mimeType = data.mimeType;
                fileName = data.fileName;
            }
        });
    };

    receiveDataDirect = (callback: (data: model.ImessageDirect) => void) => {
        this.receiveData<model.ImessageDirect>("direct", (data) => {
            callback(data);
        });
    };

    open = (): void => {
        if (!this.ws) {
            this.create();
        }
    };

    close = (): void => {
        if (this.ws) {
            this.sendMessage("text", "", "disconnect");

            this.ws.close();
        }
    };
}
