// Source
import * as Interface from "./Interface";

let websocket: WebSocket;
let timeoutReconnect: NodeJS.Timer;
let serverAddress: string;

const messageHandleList: Map<string, (message: Interface.Imessage) => void> = new Map();

export const sendMessage = (tagValue: string, messageValue: Record<string, unknown> | string) => {
    const dataStructure = {
        date: new Date().toISOString(),
        tag: `cws_${tagValue}_o`,
        message: messageValue
    };

    websocket.send(JSON.stringify(dataStructure));
};

export const readMessage = (tag: string, callback: Interface.IcallbackReadMessage) => {
    messageHandleList.set(`cws_${tag}_i`, (message) => {
        callback(message);
    });
};

export const readMessageOff = (tag: string) => {
    if (messageHandleList.has(`cws_${tag}_i`)) {
        messageHandleList.delete(`cws_${tag}_i`);
    }
};

export const connection = (address?: string) => {
    serverAddress = address ? address : serverAddress;

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
