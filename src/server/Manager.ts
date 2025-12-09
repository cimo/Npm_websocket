import * as Net from "net";
import * as Crypto from "crypto";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as model from "./Model.js";

export default class Manager {
    private secretKey: string;
    private intervalTimePing: number;
    private clientList: model.Iclient[];
    private handleReceiveDataList: model.IhandleReceiveData[];

    private generateClientId = (): string => {
        return Crypto.randomBytes(20).toString("hex");
    };

    private generateSignature = (value: string): string => {
        return Crypto.createHmac("sha256", this.secretKey).update(value).digest("hex");
    };

    private verifySignature = (clientId: string, signature: string): boolean => {
        if (signature !== this.generateSignature(clientId)) {
            return false;
        }

        return true;
    };

    private clientConnection = (socket: Net.Socket): string => {
        const clientId = this.generateClientId();
        const signature = this.generateSignature(clientId);

        helperSrc.writeLog(
            "@cimo/websocket - Server - Manager.ts - clientConnection()",
            `Connection request from Ip: ${socket.remoteAddress || ""} - Client ${clientId}.`
        );

        this.clientRemove(clientId);

        this.clientList.push({
            id: clientId,
            signature,
            username: "",
            socket,
            buffer: Buffer.alloc(0),
            opCode: -1,
            fragmentList: [],
            intervalPing: undefined,
            lastPong: Date.now()
        });

        this.sendMessage("text", clientId, "clientId_current", clientId);

        this.sendDataBroadcast({ label: "connection", result: `Client ${clientId} connected.` }, clientId);

        this.ping(clientId);

        return clientId;
    };

    private clientDisconnection = (clientId: string): void => {
        const client = this.clientCheck(clientId);

        if (!client) {
            helperSrc.writeLog("@cimo/webSocket - Server - Manager.ts - clientDisconnection()", `Client ${clientId} doesn't exists!`);

            return;
        }

        clearInterval(client.intervalPing);

        const buffer = Buffer.from("Server disconnect", "utf8");
        const payload = Buffer.alloc(2 + buffer.length);
        payload.writeUInt16BE(1000, 0);
        buffer.copy(payload, 2);
        const header = Buffer.from([0x88, payload.length]);
        const closeFrame = Buffer.concat([header, payload]);

        if (client.socket && client.socket.writable) {
            client.socket.write(closeFrame);
        }

        client.socket.destroy();
    };

    private clientCheck = (clientId: string): model.Iclient | null => {
        for (let a = 0; a < this.clientList.length; a++) {
            if (this.clientList[a].id === clientId) {
                return this.clientList[a];
            }
        }

        return null;
    };

    private clientRemove = (clientId: string): void => {
        for (let a = this.clientList.length - 1; a >= 0; a--) {
            if (this.clientList[a].id === clientId) {
                this.clientList.splice(a, 1);
            }
        }
    };

    private ping = (clientId: string): void => {
        const client = this.clientCheck(clientId);

        if (!client) {
            helperSrc.writeLog("@cimo/webSocket - Server - Manager.ts - ping()", `Client ${clientId} doesn't exists!`);

            return;
        }

        client.intervalPing = setInterval(() => {
            if (client.socket && client.socket.writable) {
                const now = Date.now();

                if (now - client.lastPong > this.intervalTimePing * 2) {
                    this.clientDisconnection(clientId);

                    return;
                }

                const frame = Buffer.alloc(2);
                frame[0] = 0x89;
                frame[1] = 0x00;

                client.socket.write(frame);
            }
        }, this.intervalTimePing);
    };

    private responseHeader = (request: model.IhttpServer.IncomingMessage): string[] => {
        const key = request.headers["sec-websocket-key"];

        if (!key || Array.isArray(key)) {
            helperSrc.writeLog("@cimo/webSocket - Server - Manager.ts - responseHeader()", "Invalid Sec-WebSocket-Key header!");
        }

        const hash = Crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");

        return ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${hash}`, "\r\n"];
    };

    private handleFrame = (clientId: string, data: Buffer, callback: model.IcallbackHandleFrame): void => {
        const client = this.clientCheck(clientId);

        if (!client) {
            helperSrc.writeLog("@cimo/webSocket - Server - Manager.ts - handleFrame()", `Client ${clientId} doesn't exists!`);

            return;
        }

        const isSignatureVerified = this.verifySignature(clientId, client.signature);

        if (!isSignatureVerified) {
            helperSrc.writeLog("@cimo/websocket - Server - Manager.ts - handleFrame()", "Wrong signature!");

            return;
        }

        client.buffer = Buffer.concat([client.buffer, data]);

        while (true) {
            if (client.buffer.length < 2) {
                break;
            }

            let payloadLength = client.buffer[1] & 0x7f;
            let maskingKeyStart = 2;

            if (payloadLength === 126) {
                if (client.buffer.length < 4) {
                    break;
                }

                payloadLength = client.buffer.readUInt16BE(2);
                maskingKeyStart = 4;
            } else if (payloadLength === 127) {
                if (client.buffer.length < 10) {
                    break;
                }

                payloadLength = Number(client.buffer.readBigUInt64BE(2));
                maskingKeyStart = 10;
            }

            const payloadStart = maskingKeyStart + 4;
            const frameLength = payloadStart + payloadLength;

            if (client.buffer.length < frameLength) {
                break;
            }

            const frame = client.buffer.subarray(0, frameLength);
            client.buffer = client.buffer.subarray(frameLength);

            const fin = (frame[0] & 0x80) === 0x80;
            client.opCode = frame[0] & 0x0f;
            const mask = frame[1] & 0x80;

            const payload = frame.subarray(payloadStart);

            if (mask) {
                const maskingKey = frame.subarray(maskingKeyStart, payloadStart);

                for (let a = 0; a < payload.length; a++) {
                    payload[a] ^= maskingKey[a % 4];
                }
            }

            if (client.opCode === 0x01 || client.opCode === 0x02 || client.opCode === 0x00) {
                client.fragmentList.push(payload);
            } else if (client.opCode === 0x0a) {
                client.lastPong = Date.now();
            }

            if (fin) {
                const clientOpCode = client.opCode;
                const clientFragmentList = client.fragmentList;

                callback(clientOpCode, clientFragmentList);

                client.opCode = -1;
                client.fragmentList = [];
            }
        }
    };

    private handleReceiveData = (tag: string, data: model.TreceiveData, clientId: string): void => {
        for (const handleReceiveData of this.handleReceiveDataList) {
            if (handleReceiveData.tag === tag) {
                handleReceiveData.callback(data, clientId);

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

    private dataDirect = (): void => {
        this.receiveData<model.ImessageDirect>("direct", (data) => {
            this.sendMessage("text", data as unknown as Record<string, unknown>, "direct", data.toClientId);
        });
    };

    private create = (server: model.IhttpServer.Server | model.IhttpsServer.Server): void => {
        server.on("upgrade", (request: model.IhttpServer.IncomingMessage, socket: Net.Socket) => {
            if (request.headers["upgrade"] && request.headers["upgrade"].toLowerCase() !== "websocket") {
                socket.end("HTTP/1.1 400 Bad Request");

                return;
            }

            socket.write(this.responseHeader(request).join("\r\n"));

            const clientId = this.clientConnection(socket);

            let messageTagUpload = "";

            socket.on("data", (data: Buffer) => {
                this.handleFrame(clientId, data, (clientOpCode, clientFragmentList) => {
                    if (clientOpCode === 1) {
                        const messageConcat = Buffer.concat(clientFragmentList).toString();

                        if (!messageConcat.trim()) {
                            return;
                        }

                        if (!helperSrc.isJson(messageConcat)) {
                            return;
                        }

                        const messageObject: model.Imessage = JSON.parse(messageConcat);

                        if (!messageObject || typeof messageObject.tag !== "string") {
                            return;
                        }

                        if (messageObject.tag === "cws_upload") {
                            messageTagUpload = messageObject.tag;
                        } else if (messageObject.tag === "cws_broadcast") {
                            this.sendDataBroadcast(messageObject.data, clientId);
                        } else if (messageObject.tag === "cws_disconnect") {
                            this.clientDisconnection(clientId);
                        }

                        this.handleReceiveData(messageObject.tag, messageObject.data, clientId);
                    } else if ((clientOpCode === 0 || clientOpCode === 2) && messageTagUpload) {
                        this.handleReceiveData(messageTagUpload, clientFragmentList, clientId);

                        messageTagUpload = "";
                    } else if (clientOpCode === 8) {
                        socket.write(Buffer.from([0x88, 0x00]));

                        this.clientDisconnection(clientId);

                        return;
                    }
                });
            });

            socket.on("error", (error) => {
                helperSrc.writeLog("@cimo/webSocket - Server - Manager.ts - create() - onerror()", `Client ${clientId} error: ${error.message}`);
            });

            socket.on("close", (isError: boolean) => {
                helperSrc.writeLog(
                    "@cimo/websocket - Server - Manager.ts - create() - onclose()",
                    `Disconnection request from Ip: ${socket.remoteAddress || ""} - Client ${clientId} - (Had error: ${isError}).`
                );

                this.sendDataBroadcast({ label: "disconnection", result: `Client ${clientId} disconnected.` }, clientId);

                this.clientRemove(clientId);
            });
        });
    };

    constructor(server: model.IhttpServer.Server | model.IhttpsServer.Server, secretKeyValue: string, intervalTimePingValue = 5000) {
        this.secretKey = secretKeyValue;
        this.intervalTimePing = intervalTimePingValue;
        this.clientList = [];
        this.handleReceiveDataList = [];

        this.create(server);

        this.dataDirect();
    }

    clientIdList = (): string[] => {
        const resultList: string[] = [];

        for (const client of this.clientList) {
            resultList.push(client.id);
        }

        return resultList;
    };

    sendMessage = (mode: string, data: model.TsendData, tag = "", clientId: string, timeout = 0): void => {
        const client = this.clientCheck(clientId);

        if (!client) {
            helperSrc.writeLog("@cimo/webSocket - Server - Manager.ts - sendMessage()", `Client ${clientId} doesn't exists!`);

            return;
        }

        if (client && client.socket && client.socket.writable) {
            let buffer: Buffer = Buffer.alloc(0);
            let frame0 = 0;

            if (!Buffer.isBuffer(data) && !(typeof data === "string") && !(typeof data === "object" && data !== null)) {
                helperSrc.writeLog("@cimo/websocket - Server - Manager.ts - sendMessage()", "Invalid data type!");
            }

            if (mode === "text" && !Buffer.isBuffer(data)) {
                let resultData = "";

                if (typeof data === "string") {
                    resultData = data;
                } else if (typeof data === "object") {
                    resultData = JSON.stringify(data);
                }

                const messageObject: model.Imessage = {
                    tag: `cws_${tag}`,
                    data: Buffer.from(resultData).toString("base64")
                };

                buffer = Buffer.from(JSON.stringify(messageObject));
                frame0 = 0x81;
            } else if (mode === "binary" && Buffer.isBuffer(data)) {
                buffer = Buffer.from(data);
                frame0 = 0x82;
            } else {
                helperSrc.writeLog("@cimo/websocket - Server - Manager.ts - sendMessage()", "Message type doesn't match mode!");
            }

            const length = buffer.length;

            let frame: Buffer;

            if (length <= 125) {
                frame = Buffer.alloc(length + 2);
                frame[0] = frame0;
                frame[1] = length;
            } else if (length <= 65535) {
                frame = Buffer.alloc(length + 4);
                frame[0] = frame0;
                frame[1] = 126;
                frame.writeUInt16BE(length, 2);
            } else {
                frame = Buffer.alloc(length + 10);
                frame[0] = frame0;
                frame[1] = 127;
                frame.writeBigUInt64BE(BigInt(length), 2);
            }

            buffer.copy(frame, frame.length - length);

            if (mode === "text" && timeout > 0) {
                const timeoutEvent = setTimeout(() => {
                    clearTimeout(timeoutEvent);

                    client.socket.write(frame);
                }, timeout);
            } else {
                client.socket.write(frame);
            }
        }
    };

    sendDataBroadcast = (data: model.TsendData, excludeClientId?: string): void => {
        for (const client of this.clientList) {
            if (client.id !== excludeClientId) {
                this.sendMessage("text", data, "broadcast", client.id);
            }
        }
    };

    sendDataDownload = (mimeType: string, fileName: string, file: Buffer, clientId: string): void => {
        this.sendMessage("text", { mimeType, fileName }, "download", clientId);
        this.sendMessage("binary", file, "", clientId, 100);
    };

    receiveData = <T>(tag: string, callbackValue: model.IcallbackReceiveData<T>): void => {
        const cwsTag = `cws_${tag}`;

        this.handleReceiveDataRemove(cwsTag);

        this.handleReceiveDataList.push({
            tag: cwsTag,
            callback: (data, clientId) => {
                let resultData: T;

                if (typeof data === "string") {
                    const decoded = Buffer.from(data, "base64").toString();

                    resultData = !helperSrc.isJson(decoded) ? (decoded as T) : (JSON.parse(decoded) as T);
                } else {
                    resultData = data as T;
                }

                callbackValue(resultData, clientId);
            }
        });
    };

    receiveDataUpload = (callback: model.IcallbackReceiveDataUpload): void => {
        let mimeType = "";
        let fileName = "";

        this.receiveData<model.TreceiveDataDownalod>("upload", (data, clientId) => {
            if (Array.isArray(data)) {
                callback(data, mimeType, fileName, clientId);

                mimeType = "";
                fileName = "";
            } else {
                mimeType = data.mimeType;
                fileName = data.fileName;
            }
        });
    };
}
