import * as Net from "net";
import * as Crypto from "crypto";

// Source
import * as Model from "./Model";

export default class CwsServer {
    private clientList: Map<string, Model.Iclient>;
    private secretKey: string;
    private modePing: number;
    private timePing: number;
    private handleReceiveDataList: Map<string, Model.IcallbackReceiveMessage>;

    getClientList = (): Map<string, Model.Iclient> => {
        return this.clientList;
    };

    constructor(server: Model.IhttpsServer, secretKey: string, modePing = 1, timePing = 25000) {
        this.clientList = new Map();
        this.secretKey = secretKey;
        this.modePing = modePing;
        this.timePing = timePing;
        this.handleReceiveDataList = new Map();

        this.create(server);
    }

    sendData = (clientId: string, mode: number, data: string | Buffer, tag = "", timeout = 0): void => {
        const client = this.checkClient(clientId);

        if (!client) {
            return;
        }

        if (client && client.socket && client.socket.writable) {
            client.lastAction = Date.now();

            let buffer: Buffer = Buffer.alloc(0);
            let frame0 = 0;

            if (mode === 1) {
                const jsonMessage = {
                    tag: `cws_${tag}`,
                    data: typeof data === "string" ? Buffer.from(data).toString("base64") : data
                } as Model.Imessage;

                buffer = Buffer.from(JSON.stringify(jsonMessage));
                frame0 = 0x81;
            } else if (mode === 2) {
                buffer = Buffer.from(data);
                frame0 = 0x82;
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

            if (mode === 1 && timeout > 0) {
                const timeoutEvent = setTimeout(() => {
                    clearTimeout(timeoutEvent);

                    client.socket.write(frame);
                }, timeout);
            } else {
                client.socket.write(frame);
            }
        }
    };

    sendDataDownload = (clientId: string, filename: string, file: Buffer): void => {
        this.sendData(clientId, 1, filename, "download");
        this.sendData(clientId, 2, file);
    };

    sendDataBroadcast = (data: string, clientId?: string): void => {
        for (const [index] of this.clientList) {
            if (!clientId || (clientId && clientId !== index)) {
                this.sendData(index, 1, data, "broadcast");
            }
        }
    };

    receiveData = (tag: string, callback: Model.IcallbackReceiveMessage): void => {
        this.handleReceiveDataList.set(`cws_${tag}`, (clientId, data) => {
            const resultData = typeof data === "string" ? Buffer.from(data, "base64").toString() : data;

            callback(clientId, resultData);
        });
    };

    receiveDataUpload = (callback: Model.IcallbackReceiveUpload): void => {
        let filename = "";

        this.receiveData("upload", (clientId, data) => {
            if (typeof data === "string") {
                filename = data;
            } else {
                callback(clientId, data, filename);

                filename = "";
            }
        });
    };

    receiveDataOff = (tag: string): void => {
        if (this.handleReceiveDataList.has(`cws_${tag}`)) {
            this.handleReceiveDataList.delete(`cws_${tag}`);
        }
    };

    private create = (server: Model.IhttpsServer): void => {
        server.on("upgrade", (request: Request, socket: Net.Socket) => {
            if (request.headers["upgrade"] !== "websocket") {
                socket.end("HTTP/1.1 400 Bad Request");

                return;
            }

            socket.write(this.responseHeader(request).join("\r\n"));

            const clientId = this.clientConnection(socket);

            let messageTagUpload = "";

            socket.on("data", (data: Buffer) => {
                this.handleFrame(clientId, data, (clientOpCode, clientFragmentList) => {
                    if (clientOpCode === 1) {
                        const jsonMessage = JSON.parse(clientFragmentList as unknown as string) as Model.Imessage;

                        if (jsonMessage.tag === "cws_client_connected") {
                            const jsonMessage = { result: `Client ${clientId} connected.`, tag: "connection" };
                            this.sendDataBroadcast(JSON.stringify(jsonMessage), clientId);
                        } else if (jsonMessage.tag === "cws_client_reconnection") {
                            this.clientReconnection(socket, clientId);
                        } else if (jsonMessage.tag === "cws_pong") {
                            // eslint-disable-next-line no-console
                            //console.log("@cimo/webSocket - Server => Service.ts => create() => onUpgrade() => onData() => cws_pong", `Client ${clientId} pong.`);
                        } else if (jsonMessage.tag === "cws_upload") {
                            messageTagUpload = jsonMessage.tag;
                        } else if (jsonMessage.tag === "cws_broadcast") {
                            this.sendDataBroadcast(jsonMessage.data, clientId);
                        }

                        this.handleReceiveData(jsonMessage.tag, clientId, jsonMessage.data);
                    } else if ((clientOpCode === 0 || clientOpCode === 2) && messageTagUpload) {
                        this.handleReceiveData(messageTagUpload, clientId, clientFragmentList);

                        messageTagUpload = "";
                    }
                });
            });

            socket.on("end", () => {
                this.clientDisconnection(socket, clientId);
            });
        });
    };

    private responseHeader = (request: Request): string[] => {
        const key = (request.headers["sec-websocket-key"] as string) || "";
        const hash = Crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");

        return ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${hash}`, "\r\n"];
    };

    private generateClientId(): string {
        return Crypto.randomBytes(20).toString("hex");
    }

    private checkClient = (clientId: string): Model.Iclient | undefined => {
        const client = this.clientList.get(clientId);

        if (!client) {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Server => Service.ts => checkClient()", `Client ${clientId} doesn't exists!`);

            return undefined;
        }

        return client;
    };

    private handleFrame = (clientId: string, data: Buffer, callback: Model.IcallbackHandleFrame): void => {
        const client = this.checkClient(clientId);

        if (!client) {
            return;
        }

        const verifySignature = this.verifySignature(clientId, client.signature);

        if (!verifySignature) {
            return;
        }

        client.buffer = Buffer.concat([client.buffer, data]);

        while (client.buffer.length > 2) {
            let payloadLength = client.buffer[1] & 0x7f;
            let frameLength = payloadLength + 6;
            let maskingKeyStart = 2;

            if (payloadLength === 126) {
                payloadLength = client.buffer.readUInt16BE(2);
                frameLength = payloadLength + 8;
                maskingKeyStart = 4;
            } else if (payloadLength === 127) {
                payloadLength = Number(client.buffer.readBigUInt64BE(2));
                frameLength = payloadLength + 14;
                maskingKeyStart = 10;
            }

            if (client.buffer.length < frameLength) {
                break;
            }

            const frame = client.buffer.slice(0, frameLength);
            client.buffer = client.buffer.slice(frameLength);

            const fin = (frame[0] & 0x80) === 0x80;
            client.opCode = frame[0] & 0x0f;
            const isMasked = frame[1] & 0x80;

            const payloadStart = maskingKeyStart + 4;
            const payload = frame.slice(payloadStart);

            if (isMasked) {
                const maskingKey = frame.slice(maskingKeyStart, payloadStart);

                for (let a = 0; a < payload.length; a++) {
                    payload[a] ^= maskingKey[a % 4];
                }
            }

            if (client.opCode === 0x01 || client.opCode === 0x02 || client.opCode === 0x00) {
                client.fragmentList.push(payload);
            } else if (client.opCode === 0x0a) {
                // eslint-disable-next-line no-console
                //console.log("@cimo/webSocket - Server => Service.ts => handleFrame()", `Client ${clientId} pong.`);
            }

            if (fin) {
                const clientOpCode = client.opCode;
                const clientFragmentList = client.fragmentList;

                callback(clientOpCode, clientFragmentList);

                client.buffer = Buffer.alloc(0);
                client.opCode = -1;
                client.fragmentList = [];
            }
        }
    };

    private ping = (clientId: string): void => {
        const client = this.checkClient(clientId);

        if (!client) {
            return;
        }

        client.intervalPing = setInterval(() => {
            if (this.modePing === 1) {
                if (client.socket && client.socket.writable) {
                    const frame = Buffer.alloc(2);
                    frame[0] = 0x89;
                    frame[1] = 0x00;

                    client.socket.write(frame);
                }
            } else if (this.modePing === 2) {
                this.sendData(clientId, 1, "", "ping");
            }
        }, this.timePing);
    };

    private handleReceiveData = (tag: string, clientId: string, data: string | Buffer[]): void => {
        for (const [index, callback] of this.handleReceiveDataList) {
            if (tag === index) {
                callback(clientId, data);

                return;
            }
        }
    };

    private cleanup = (clientId: string): void => {
        const client = this.clientList.get(clientId);

        if (!client) {
            return;
        }

        client.socket.end();

        this.clientList.delete(clientId);
    };

    private clientConnection(socket: Net.Socket): string {
        const clientId = this.generateClientId();
        const signature = this.generateSignature(clientId);

        // eslint-disable-next-line no-console
        console.log(
            "@cimo/webSocket - Server => Service.ts => clientConnection()",
            `Connection request from -> Ip: ${socket.remoteAddress || ""} - Client ${clientId}.`
        );

        this.clientList.set(clientId, {
            socket,
            buffer: Buffer.alloc(0),
            signature,
            opCode: -1,
            fragmentList: [],
            intervalPing: undefined,
            lastAction: Date.now()
        });

        this.sendData(clientId, 1, clientId, "client_connection");

        this.ping(clientId);

        return clientId;
    }

    private clientReconnection = (socket: Net.Socket, clientId: string): string | undefined => {
        const client = this.checkClient(clientId);

        if (!client) {
            return "";
        }

        const verifySignature = this.verifySignature(clientId, client.signature);

        if (!verifySignature) {
            return "";
        }

        // eslint-disable-next-line no-console
        console.log(
            "@cimo/webSocket - Server => Service.ts => clientReconnection()",
            `Reconnection request from -> Ip: ${socket.remoteAddress || ""} - Client ${clientId}.`
        );

        const jsonMessage = { result: `Client ${clientId} reconnected.`, tag: "reconnection" };
        this.sendDataBroadcast(JSON.stringify(jsonMessage), clientId);
    };

    private clientDisconnection = (socket: Net.Socket, clientId: string): void => {
        // eslint-disable-next-line no-console
        console.log(
            "@cimo/webSocket - Server => Service.ts => clientDisconnection()",
            `Disconnection request from -> Ip: ${socket.remoteAddress || ""} - Client ${clientId}.`
        );

        this.cleanup(clientId);

        const jsonMessage = { result: `Client ${clientId} disconnected.`, tag: "disconnection" };
        this.sendDataBroadcast(JSON.stringify(jsonMessage), clientId);
    };

    private generateSignature = (data: string): string => {
        return Crypto.createHmac("sha256", this.secretKey).update(data).digest("hex");
    };

    private verifySignature = (data: string, signature: string): boolean => {
        if (signature !== this.generateSignature(data)) {
            // eslint-disable-next-line no-console
            console.log("@cimo/webSocket - Server => Service.ts => verifySignature()", `Wrong signature!`);

            return false;
        }

        return true;
    };
}
