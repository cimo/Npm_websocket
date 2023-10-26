import * as Crypto from "crypto";

// Source
import * as Interface from "./Interface";

export default class CwsServer {
    private WEBSOCKET_MAGIC_STRING_KEY: string;
    private SEVEN_BITS_INTEGER_MARKER: number;
    private SIXTEEN_BITS_INTEGER_MARKER: number;
    private THIRTYTWO_BITS_INTEGER_MARKER: number;
    private MASK_KEY_BYTES_LENGTH: number;

    private socketList: Interface.Isocket[];
    private receiveOutputHandleList: Map<string, (socket: Interface.Isocket, data: Interface.Imessage) => void>;

    constructor() {
        this.WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        this.SEVEN_BITS_INTEGER_MARKER = 125;
        this.SIXTEEN_BITS_INTEGER_MARKER = 126;
        this.THIRTYTWO_BITS_INTEGER_MARKER = 127;
        this.MASK_KEY_BYTES_LENGTH = 4;

        this.socketList = [];
        this.receiveOutputHandleList = new Map();
    }

    create = (server: Interface.IhttpsServer) => {
        server.on("upgrade", this.onServerUpgrade);
    };

    receiveOutput = (tag: string, callback: Interface.IcallbackReceiveOutput) => {
        this.receiveOutputHandleList.set(`cws_${tag}_o`, (socket, data) => {
            callback(socket, data);

            return;
        });
    };

    receiveOutputOff = (tag: string) => {
        if (this.receiveOutputHandleList.has(`cws_${tag}_o`)) {
            this.receiveOutputHandleList.delete(`cws_${tag}_o`);
        }
    };

    sendInput = (socket: Interface.Isocket | null, tagValue: string, messageValue: string | Record<string, unknown>) => {
        if (socket && tagValue) {
            const dataStructure = {
                date: new Date().toISOString(),
                tag: `cws_${tagValue}_i`,
                message: messageValue
            };

            const result = this.prepareMessage(JSON.stringify(dataStructure));

            socket.write(result);
        }
    };

    sendInputBroadcast = (socket: Interface.Isocket | null, tag: string, message: string | Record<string, unknown>) => {
        for (const client of this.socketList) {
            if (client && !client.destroyed && client !== socket) {
                this.sendInput(client, tag, message);
            }
        }
    };

    private onServerUpgrade = (request: { headers: Record<string, unknown> }, socket: Interface.Isocket) => {
        if (request.headers["upgrade"] !== "websocket") {
            socket.end("HTTP/1.1 400 Bad Request");

            return;
        }

        const { "sec-websocket-key": webClientSocketKey } = request.headers;

        const socketKey = webClientSocketKey as string;
        const acceptKey = Crypto.createHash("sha1").update(socketKey.concat(this.WEBSOCKET_MAGIC_STRING_KEY)).digest("base64");

        const header = ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${acceptKey}`, ""]
            .map((line) => line.concat("\r\n"))
            .join("");

        socket.write(header, (error) => {
            if (error) {
                throw new Error(`@cimo/websocket - Service.ts - onServerUpgrade - Error: ${error.toString()}`);
            }
        });

        this.socketList.push(socket);

        socket.on("data", (buffer) => {
            this.onSocketData(socket, buffer);
        });

        socket.on("end", () => {
            this.onSocketEnd(socket);
        });

        this.sendInputBroadcast(socket, "broadcast", `Client ${socket.remoteAddress || ""} connected.`);
    };

    private onSocketData = (socket: Interface.Isocket, buffer: Buffer) => {
        let data = {} as Interface.Imessage;

        let payloadLength = buffer[1] & 0x7f;
        let payloadOffset = 2;
        const opcode = buffer[0] & 0x0f;
        const isMasked = (buffer[1] & 0x80) !== 0;

        if (payloadLength === this.SIXTEEN_BITS_INTEGER_MARKER) {
            payloadLength = buffer.readUInt16BE(2);
            payloadOffset = 4;
        } else if (payloadLength === this.THIRTYTWO_BITS_INTEGER_MARKER) {
            payloadLength = buffer.readUInt32BE(2);
            payloadOffset = 10;
        }

        if (isMasked) {
            const maskingKey = buffer.slice(payloadOffset, payloadOffset + this.MASK_KEY_BYTES_LENGTH);
            payloadOffset += this.MASK_KEY_BYTES_LENGTH;

            for (let i = 0; i < payloadLength; i++) {
                buffer[payloadOffset + i] ^= maskingKey[i % this.MASK_KEY_BYTES_LENGTH];
            }
        }

        const payloadData = buffer.slice(payloadOffset, payloadOffset + payloadLength);

        if (opcode === 0x01) {
            const payloadOutput = payloadData.toString("utf-8");

            if (
                /^[\],:{}\s]*$/.test(
                    payloadOutput
                        .replace(/\\["\\/bfnrtu]/g, "@")
                        .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\\-]?\d+)?/g, "]")
                        .replace(/(?:^|:|,)(?:\s*\[)+/g, "")
                )
            ) {
                data = JSON.parse(payloadOutput) as Interface.Imessage;
            }
        }

        this.receiveOutputHandle(socket, data);
    };

    private onSocketEnd = (socket: Interface.Isocket) => {
        this.sendInputBroadcast(socket, "broadcast", `Client ${socket.remoteAddress || ""} disconnected.`);

        const index = this.socketList.indexOf(socket);

        if (index > -1) {
            this.socketList.splice(index, 1);
        }

        socket.destroy();
    };

    private receiveOutputHandle = (socket: Interface.Isocket, data: Interface.Imessage) => {
        for (const [tag, callback] of this.receiveOutputHandleList) {
            if (tag === data.tag) {
                callback(socket, data);

                return;
            }
        }
    };

    private prepareMessage = (data: string) => {
        const message = Buffer.from(data);
        const messageSize = message.length;

        let dataBuffer: Buffer;

        const firstByte = 0x80 | 0x01;

        if (messageSize <= this.SEVEN_BITS_INTEGER_MARKER) {
            const bytes = [firstByte];

            dataBuffer = Buffer.from(bytes.concat(messageSize));
        } else if (messageSize <= 2 ** 16) {
            const target = Buffer.allocUnsafe(4);

            target[0] = firstByte;
            target[1] = this.SIXTEEN_BITS_INTEGER_MARKER | 0x0;

            target.writeUint16BE(messageSize, 2);

            dataBuffer = target;
        } else {
            throw new Error("@cimo/websocket - Service.ts - prepareMessage - Error: Message too long.");
        }

        const totalLength = dataBuffer.byteLength + messageSize;

        const result = Buffer.allocUnsafe(totalLength);
        let offset = 0;

        for (const buffer of [dataBuffer, message]) {
            result.set(buffer, offset);
            offset += buffer.length;
        }

        return result;
    };
}
