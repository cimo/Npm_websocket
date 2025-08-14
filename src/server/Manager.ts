import * as Net from "net";
import * as Crypto from "crypto";

// Source
import * as helperSrc from "../HelperSrc";
import * as model from "./Model";

export default class Manager {
    private secretKey: string;
    private timePing: number;
    private clientMap: Map<string, model.Iclient>;
    private callbackHandleResponseMap: Map<string, model.IcallbackHandleResponse>;

    private responseHeader = (request: model.IhttpServer.IncomingMessage): string[] => {
        const key = request.headers["sec-websocket-key"];

        if (!key || Array.isArray(key)) {
            throw new Error("@cimo/webSocket - Server - Manager.ts - responseHeader() => Invalid Sec-WebSocket-Key header!");
        }

        const hash = Crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");

        return ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${hash}`, "\r\n"];
    };

    private generateClientId(): string {
        return Crypto.randomBytes(20).toString("hex");
    }

    private generateSignature = (value: string): string => {
        return Crypto.createHmac("sha256", this.secretKey).update(value).digest("hex");
    };

    private ping = (clientId: string): void => {
        const client = this.checkClient(clientId);

        if (!client) {
            return;
        }

        client.intervalPing = setInterval(() => {
            if (client.socket && client.socket.writable) {
                const now = Date.now();

                if (now - client.lastPong > this.timePing * 2) {
                    helperSrc.writeLog("@cimo/websocket - Server - Manager.ts - ping() - setInterval()", `Client ${clientId} pong timeout.`);

                    this.clientDisconnection(client.socket, clientId);

                    return;
                }

                const frame = Buffer.alloc(2);
                frame[0] = 0x89;
                frame[1] = 0x00;

                client.socket.write(frame);
            }
        }, this.timePing);
    };

    private clientConnection(socket: Net.Socket): string {
        const clientId = this.generateClientId();
        const signature = this.generateSignature(clientId);

        helperSrc.writeLog(
            "@cimo/websocket - Server - Manager.ts - clientConnection()",
            `Connection request from Ip: ${socket.remoteAddress || ""} - Client ${clientId}.`
        );

        this.clientMap.set(clientId, {
            socket,
            buffer: Buffer.alloc(0),
            signature,
            opCode: -1,
            fragmentList: [],
            intervalPing: undefined,
            lastPong: Date.now()
        });

        this.sendDataBroadcast({ tag: "connection", result: `Client ${clientId} connected.` }, clientId);

        this.ping(clientId);

        return clientId;
    }

    private checkClient = (clientId: string): model.Iclient => {
        const client = this.clientMap.get(clientId);

        if (!client) {
            throw new Error(`@cimo/webSocket - Server - Manager.ts - checkClient() => Client ${clientId} doesn't exists!`);
        }

        return client;
    };

    private verifySignature = (value: string, signature: string): boolean => {
        if (signature !== this.generateSignature(value)) {
            throw new Error("@cimo/websocket - Server - Manager.ts - verifySignature() => Wrong signature!");
        }

        return true;
    };

    private handleFrame = (clientId: string, data: Buffer, callback: model.IcallbackHandleFrame): void => {
        const client = this.checkClient(clientId);

        if (!client) {
            return;
        }

        const isSignatureVerified = this.verifySignature(clientId, client.signature);

        if (!isSignatureVerified) {
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

    private handleResponse = (clientId: string, tag: string, message: model.ThandleMessage): void => {
        for (const [index, callback] of this.callbackHandleResponseMap) {
            if (tag === index) {
                callback(clientId, message);

                return;
            }
        }
    };

    private cleanup = (clientId: string): void => {
        const client = this.clientMap.get(clientId);

        if (!client) {
            return;
        }

        if (client.intervalPing) {
            clearInterval(client.intervalPing);
        }

        client.socket.end();

        this.clientMap.delete(clientId);
    };

    private clientDisconnection = (socket: Net.Socket, clientId: string): void => {
        helperSrc.writeLog(
            "@cimo/websocket - Server - Manager.ts - clientDisconnection()",
            `Disconnection request from Ip: ${socket.remoteAddress || ""} - Client ${clientId}.`
        );

        this.sendDataBroadcast({ tag: "disconnection", result: `Client ${clientId} disconnected.` }, clientId);

        this.cleanup(clientId);
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
                        }

                        this.handleResponse(clientId, messageObject.tag, messageObject.data);
                    } else if ((clientOpCode === 0 || clientOpCode === 2) && messageTagUpload) {
                        this.handleResponse(clientId, messageTagUpload, clientFragmentList);

                        messageTagUpload = "";
                    }
                });
            });

            socket.on("end", () => {
                this.clientDisconnection(socket, clientId);
            });
        });
    };

    constructor(server: model.IhttpServer.Server | model.IhttpsServer.Server, secretKeyValue: string, timePingValue = 25000) {
        this.secretKey = secretKeyValue;
        this.timePing = timePingValue;
        this.clientMap = new Map();
        this.callbackHandleResponseMap = new Map();

        this.create(server);
    }

    getClientMap = (): Map<string, model.Iclient> => {
        return this.clientMap;
    };

    sendData = (clientId: string, mode: string, message: model.TsendMessage, tag = "", timeout = 0): void => {
        const client = this.checkClient(clientId);

        if (!client) {
            return;
        }

        if (client && client.socket && client.socket.writable) {
            let buffer: Buffer = Buffer.alloc(0);
            let frame0 = 0;

            if (!Buffer.isBuffer(message) && !(typeof message === "string") && !(typeof message === "object" && message !== null)) {
                throw new Error("@cimo/websocket - Server - Manager.ts - sendData() => Invalid message type!");
            }

            if (mode === "text" && !Buffer.isBuffer(message)) {
                let resultMessage = "";

                if (typeof message === "string") {
                    resultMessage = message;
                } else if (typeof message === "object") {
                    resultMessage = JSON.stringify(message);
                }

                const messageObject: model.Imessage = {
                    tag: `cws_${tag}`,
                    data: Buffer.from(resultMessage).toString("base64")
                };

                buffer = Buffer.from(JSON.stringify(messageObject));
                frame0 = 0x81;
            } else if (mode === "binary" && Buffer.isBuffer(message)) {
                buffer = Buffer.from(message);
                frame0 = 0x82;
            } else {
                throw new Error("@cimo/websocket - Server - Manager.ts - sendData() => Message type doesn't match mode!");
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

    receiveData = <T>(tag: string, callback: (clientId: string, message: T) => void): void => {
        this.callbackHandleResponseMap.set(`cws_${tag}`, (clientId, message) => {
            let resultMessage: T;

            if (typeof message === "string") {
                const decoded = Buffer.from(message, "base64").toString();

                if (!helperSrc.isJson(decoded)) {
                    resultMessage = decoded as T;
                } else {
                    resultMessage = JSON.parse(decoded) as T;
                }
            } else {
                resultMessage = message as T;
            }

            callback(clientId, resultMessage);
        });
    };

    sendDataDownload = (clientId: string, filename: string, file: Buffer): void => {
        this.sendData(clientId, "text", filename, "download");
        this.sendData(clientId, "binary", file, "", 100);
    };

    receiveDataUpload = (callback: model.IcallbackReceiveDataUpload): void => {
        let filename = "";

        this.receiveData("upload", (clientId, message: model.ThandleMessage) => {
            if (typeof message === "string") {
                filename = message;
            } else {
                callback(clientId, message, filename);

                filename = "";
            }
        });
    };

    receiveDataOff = (tag: string): void => {
        if (this.callbackHandleResponseMap.has(`cws_${tag}`)) {
            this.callbackHandleResponseMap.delete(`cws_${tag}`);
        }
    };

    sendDataBroadcast = (message: model.TsendMessage, excludeClientId?: string): void => {
        for (const clientId of this.clientMap.keys()) {
            if (clientId !== excludeClientId) {
                this.sendData(clientId, "text", message, "broadcast");
            }
        }
    };
}
