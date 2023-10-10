// Source
import * as Interface from "./Interface";

let websocket: WebSocket | null = null;
let timeoutReconnect: NodeJS.Timer;
let serverAddress = "";

const messageHandleList: Map<string, (data: Interface.Imessage) => void> = new Map();

export const sendMessage = (tagValue: string, messageValue: string | Record<string, unknown>) => {
    if (websocket) {
        const dataStructure = {
            date: new Date().toISOString(),
            tag: `cws_${tagValue}_o`,
            message: messageValue
        };

        websocket.send(JSON.stringify(dataStructure));
    }
};

export const receiveMessage = (tag: string, callback: Interface.IcallbackReceiveMessage) => {
    messageHandleList.set(`cws_${tag}_i`, (data) => {
        callback(data);
    });
};

export const receiveMessageOff = (tag: string) => {
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
    // eslint-disable-next-line no-console
    console.log("@cimo/websocket - Message.ts - eventOpen():", "Connected.");

    clearTimeout(timeoutReconnect);
};

const eventMessage = (event: MessageEvent) => {
    messageHandle(event);
};

const eventClose = () => {
    if (websocket) {
        // eslint-disable-next-line no-console
        console.log("@cimo/websocket - Message.ts - eventClose():", "Try to reconnect...");

        websocket.removeEventListener("open", eventOpen);
        websocket.removeEventListener("message", eventMessage);
        websocket.removeEventListener("close", eventClose);

        websocket = null;

        timeoutReconnect = setTimeout(connection, 1000);
    }
};
