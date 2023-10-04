// Source
import * as Interface from "./Interface";
import * as Helper from "./Helper";

let websocket: WebSocket;
let timeoutReconnect: NodeJS.Timer;
let serverAddress: string;
let clientDebug: boolean;

const messageHandleList: Map<string, (message: Interface.Imessage) => void> = new Map();

export const sendMessage = (tagValue: string, messageValue: Record<string, unknown> | string) => {
    const dataStructure = {
        date: new Date().toISOString(),
        tag: `cws_${tagValue}_o`,
        message: messageValue
    };

    Helper.writeLog(`@cimo/websocket - Message.ts - sendMessage()`, `dataStructure: ${Helper.objectOutput(dataStructure)}`);

    websocket.send(JSON.stringify(dataStructure));
};

export const readMessage = (tag: string, callback: Interface.IcallbackReadMessage) => {
    messageHandleList.set(`cws_${tag}_i`, (message) => {
        Helper.writeLog(`@cimo/websocket - Message.ts - readMessage()`, `tag: cws_${tag}_i - message: ${Helper.objectOutput(message)}`);

        callback(message);
    });
};

export const readMessageOff = (tag: string) => {
    if (messageHandleList.has(`cws_${tag}_i`)) {
        messageHandleList.delete(`cws_${tag}_i`);

        Helper.writeLog(`@cimo/websocket - Message.ts - readMessageOff()`, `messageHandleList: ${Helper.objectOutput(messageHandleList)}`);
    }
};

export const connection = (address?: string, debug?: boolean) => {
    serverAddress = address ? address : serverAddress;
    clientDebug = debug ? debug : clientDebug;

    Helper.setDebug(clientDebug);

    Helper.writeLog("@cimo/websocket - Message.ts - connection()", "Try to connect...");

    websocket = new WebSocket(`wss://${serverAddress}`);

    websocket.addEventListener("open", eventOpen);
    websocket.addEventListener("message", eventMessage);
    websocket.addEventListener("close", eventClose);
};

const messageHandle = (event: MessageEvent) => {
    const data = JSON.parse(event.data as string) as Interface.Imessage;

    for (const [tag, eventHandler] of messageHandleList) {
        if (data.tag === tag) {
            eventHandler(data);

            return;
        }
    }
};

const eventOpen = () => {
    Helper.writeLog("@cimo/websocket - Message.ts - eventOpen()", "Connected.");

    clearTimeout(timeoutReconnect);
};

const eventMessage = (event: MessageEvent) => {
    messageHandle(event);
};

const eventClose = () => {
    websocket.removeEventListener("open", eventOpen);
    websocket.removeEventListener("message", eventMessage);
    websocket.removeEventListener("close", eventClose);

    timeoutReconnect = setTimeout(connection, 1000);
};
