import * as Crypto from "crypto";
import * as Net from "net";
import * as Https from "https";

// Source
import * as Interface from "./Interface";
import * as Helper from "./Helper";

const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const MAXIMUM_SIXTEEN_BITS_INTEGER = 2 ** 16;
const MASK_KEY_BYTES_LENGTH = 4;
const OPCODE_TEXT = 0x01;
const FIRST_BIT = 128;

const socketList: Net.Socket[] = [];
const messageHandleList: Map<string, (message: Interface.Imessage) => void> = new Map();

export const readOutput = (tag: string, callback: Interface.IcallbackReadMessage) => {
    messageHandleList.set(`cws_${tag}_o`, (message) => {
        Helper.writeLog(`@cimo/websocket - Message.ts - readOutput()`, `tag: cws_${tag}_o - message: ${Helper.objectOutput(message)}`);

        callback(message);
    });
};

export const readOutputOff = (tag: string) => {
    if (messageHandleList.has(`cws_${tag}_o`)) {
        messageHandleList.delete(`cws_${tag}_o`);

        Helper.writeLog(`@cimo/websocket - Message.ts - readOutputOff()`, `messageHandleList: ${Helper.objectOutput(messageHandleList)}`);
    }
};

export const sendInput = (socket: Net.Socket, tagValue: string, messageValue: Record<string, unknown> | string) => {
    if (tagValue) {
        const tagValueSplit = tagValue.split("_");
        tagValueSplit.shift();
        tagValueSplit.pop();
        const tagValueJoin = tagValueSplit.join("_");

        const dataStructure = {
            date: new Date().toISOString(),
            tag: `cws_${tagValueJoin}_i`,
            message: messageValue
        };

        Helper.writeLog(`@cimo/websocket - Message.ts - sendInput()`, `dataStructure: ${Helper.objectOutput(dataStructure)}`);

        const result = prepareMessage(JSON.stringify(dataStructure));

        socket.write(result);
    }
};

export const sendInputBroadcast = (socket: Net.Socket, tag: string, message: Record<string, unknown> | string, excludeSender = true) => {
    Helper.writeLog("@cimo/websocket - Message.ts - sendInputBroadcast()", `tag: ${tag} - message: ${Helper.objectOutput(message)}`);

    for (const client of socketList) {
        if (client && !client.destroyed) {
            if ((excludeSender && client !== socket) || !excludeSender) {
                sendInput(client, `cws_${tag}_i`, message);
            }
        }
    }
};

export const create = (server: Https.Server, pathLogValue?: string) => {
    Helper.setPathLog(pathLogValue);

    server.on("upgrade", onServerUpgrade);
};

const messageHandle = (data: Interface.Imessage) => {
    for (const [tag, eventHandler] of messageHandleList) {
        if (data.tag === tag) {
            eventHandler(data);

            return;
        }
    }
};

const prepareMessage = (data: string) => {
    const message = Buffer.from(data);
    const messageSize = message.length;

    let dataBuffer: Buffer;

    const firstByte = 0x80 | OPCODE_TEXT;

    if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
        const bytes = [firstByte];

        dataBuffer = Buffer.from(bytes.concat(messageSize));
    } else if (messageSize <= MAXIMUM_SIXTEEN_BITS_INTEGER) {
        const offsetFourBytes = 4;
        const target = Buffer.allocUnsafe(offsetFourBytes);

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

const unmask = (encodedBuffer: Buffer, maskKey: Buffer) => {
    const finalBuffer = Buffer.from(encodedBuffer);

    for (let index = 0; index < encodedBuffer.length; index++) {
        finalBuffer[index] = encodedBuffer[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH];
    }

    return finalBuffer;
};

const onSocketEnd = (socket: Net.Socket) => {
    sendInputBroadcast(socket, "broadcast", `Client ${socket.remoteAddress || ""} disconnected.`);

    const index = socketList.indexOf(socket);

    if (index !== -1) {
        socketList.splice(index, 1);
    }

    socket.destroy();
};

const onSocketReadable = (socket: Net.Socket) => {
    socket.read(1);

    const socketRead = socket.read(1) as [number];

    if (socketRead !== null) {
        const [markerAndPayloadLength] = socketRead;

        const lengthIndicatorInBits = markerAndPayloadLength - FIRST_BIT;

        let messageLength = 0;

        if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
            messageLength = lengthIndicatorInBits;
        } else if (lengthIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
            const socketRead = socket.read(2) as Buffer;

            messageLength = socketRead.readUint16BE(0);
        } else {
            throw new Error("@cimo/websocket - Message.ts - onSocketReadable - Error: Message too long.");
        }

        const maskKey = socket.read(MASK_KEY_BYTES_LENGTH) as Buffer;
        const encoded = socket.read(messageLength) as Buffer;
        const decoded = unmask(encoded, maskKey).toString("utf8");

        let data = {} as Interface.Imessage;

        const checkJsonResult = Helper.checkJson(decoded);

        if (checkJsonResult) {
            data = JSON.parse(decoded) as Interface.Imessage;
        }

        messageHandle(data);
    }
};

const onServerUpgrade = (request: { headers: Record<string, unknown> }, socket: Net.Socket) => {
    if (request.headers["upgrade"] !== "websocket") {
        socket.destroy();

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
            throw new Error(`@cimo/websocket - Message.ts - onServerUpgrade - Error: ${Helper.objectOutput(error)}`);
        }
    });

    socketList.push(socket);

    socket.on("readable", () => onSocketReadable(socket));

    socket.on("end", () => onSocketEnd(socket));

    sendInputBroadcast(socket, "broadcast", `Client ${socket.remoteAddress || ""} connected.`);
};

Helper.keepProcess();
