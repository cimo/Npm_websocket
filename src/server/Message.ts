import * as Crypto from "crypto";

// Source
import * as Interface from "./Interface";

const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const THIRTYTWO_BITS_INTEGER_MARKER = 127;
const MASK_KEY_BYTES_LENGTH = 4;

const socketList: Interface.Isocket[] = [];
const messageHandleList: Map<string, (socket: Interface.Isocket, data: Interface.Imessage) => void> = new Map();

export const receiveOutput = (tag: string, callback: Interface.IcallbackReceiveOutput) => {
    messageHandleList.set(`cws_${tag}_o`, (socket, data) => {
        callback(socket, data);
    });
};

export const receiveOutputOff = (tag: string) => {
    if (messageHandleList.has(`cws_${tag}_o`)) {
        messageHandleList.delete(`cws_${tag}_o`);
    }
};

export const sendInput = (socket: Interface.Isocket, tagValue: string, messageValue: string | Record<string, unknown>) => {
    if (tagValue) {
        const dataStructure = {
            date: new Date().toISOString(),
            tag: `cws_${tagValue}_i`,
            message: messageValue
        };

        const result = prepareMessage(JSON.stringify(dataStructure));

        socket.write(result);
    }
};

export const sendInputBroadcast = (socket: Interface.Isocket, tag: string, message: string | Record<string, unknown>, excludeSender = true) => {
    for (const client of socketList) {
        if (client && !client.destroyed) {
            if ((excludeSender && client !== socket) || !excludeSender) {
                sendInput(client, tag, message);
            }
        }
    }
};

export const create = (server: Interface.HttpsServer) => {
    server.on("upgrade", onServerUpgrade);
};

const prepareMessage = (data: string) => {
    const message = Buffer.from(data);
    const messageSize = message.length;

    let dataBuffer: Buffer;

    const firstByte = 0x80 | 0x01;

    if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
        const bytes = [firstByte];

        dataBuffer = Buffer.from(bytes.concat(messageSize));
    } else if (messageSize <= 2 ** 16) {
        const target = Buffer.allocUnsafe(4);

        target[0] = firstByte;
        target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0;

        target.writeUint16BE(messageSize, 2);

        dataBuffer = target;
    } else {
        throw new Error("@cimo/websocket - Message.ts - prepareMessage - Error: Message too long.");
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

const messageHandle = (socket: Interface.Isocket, data: Interface.Imessage) => {
    for (const [tag, eventHandler] of messageHandleList) {
        if (data.tag === tag) {
            eventHandler(socket, data);

            return;
        }
    }
};

const onSocketEnd = (socket: Interface.Isocket) => {
    sendInputBroadcast(socket, "broadcast", `Client ${socket.remoteAddress || ""} disconnected.`);

    const index = socketList.indexOf(socket);

    if (index > -1) {
        socketList.splice(index, 1);
    }

    socket.destroy();
};

const onSocketData = (socket: Interface.Isocket, buffer: Buffer) => {
    let data = {} as Interface.Imessage;

    let payloadLength = buffer[1] & 0x7f;
    let payloadOffset = 2;
    const opcode = buffer[0] & 0x0f;
    const isMasked = (buffer[1] & 0x80) !== 0;

    if (payloadLength === SIXTEEN_BITS_INTEGER_MARKER) {
        payloadLength = buffer.readUInt16BE(2);
        payloadOffset = 4;
    } else if (payloadLength === THIRTYTWO_BITS_INTEGER_MARKER) {
        payloadLength = buffer.readUInt32BE(2);
        payloadOffset = 10;
    }

    if (isMasked) {
        const maskingKey = buffer.slice(payloadOffset, payloadOffset + MASK_KEY_BYTES_LENGTH);
        payloadOffset += MASK_KEY_BYTES_LENGTH;

        for (let i = 0; i < payloadLength; i++) {
            buffer[payloadOffset + i] ^= maskingKey[i % MASK_KEY_BYTES_LENGTH];
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

    messageHandle(socket, data);
};

const onServerUpgrade = (request: { headers: Record<string, unknown> }, socket: Interface.Isocket) => {
    if (request.headers["upgrade"] !== "websocket") {
        socket.end("HTTP/1.1 400 Bad Request");

        return;
    }

    const { "sec-websocket-key": webClientSocketKey } = request.headers;

    const socketKey = webClientSocketKey as string;
    const acceptKey = Crypto.createHash("sha1").update(socketKey.concat(WEBSOCKET_MAGIC_STRING_KEY)).digest("base64");

    const header = ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${acceptKey}`, ""]
        .map((line) => line.concat("\r\n"))
        .join("");

    socket.write(header, (error) => {
        if (error) {
            throw new Error(`@cimo/websocket - Message.ts - onServerUpgrade - Error: ${error.toString()}`);
        }
    });

    socketList.push(socket);

    socket.on("data", (buffer) => {
        onSocketData(socket, buffer);
    });

    socket.on("end", () => {
        onSocketEnd(socket);
    });

    sendInputBroadcast(socket, "broadcast", `Client ${socket.remoteAddress || ""} connected.`);
};
