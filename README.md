# Websocket

Websocket (server/client). Light, fast and secure.

## Publish

1. npm run build
2. npm login --auth-type=legacy
3. npm publish --auth-type=legacy --access public

## Installation

1. Link for npm package -> https://www.npmjs.com/package/@cimo/websocket

## Server - Example with "NodeJs Express"

-   Server.ts

```
...

import { CwsServer } from "@cimo/websocket";

// Source
import * as ControllerTest from "../controller/Test";

...

const cwsServer = new CwsServer();
cwsServer.create(server);

cwsServer.receiveOutput("test", (socket, data) => {
    ControllerTest.websocket(cwsServer, socket, data);
});

...
```

-   ControllerTest.ts

```
...

import { CwsServer, CwsServerInterface } from "@cimo/websocket";

...

let cwsServer: CwsServer;

...

export const websocket = (cwsServerValue: CwsServer, socket: CwsServerInterface.Isocket, data: CwsServerInterface.Imessage) => {
    cwsServer = cwsServerValue;

    const tag = data.tag;
    const message = data.message;

    if (tag === "cws_test_o") {
        cwsServer.sendInput(socket, "test", message);
    }
};

...
```

## Client

-   Index.ts

```
...

import CwsClient from "@cimo/websocket/dist/client/Service";

...

const cwsClient = CwsClient();
cwsClient.connection("wss://localhost");

cwsClient.receiveMessage("broadcast", (data) => {
    // Global event
});

cwsClient.receiveMessage("test", (data) => {
    // Test event
});

...

elementButton.addEventListener("click", (event) => {
    cwsClient.sendMessage("test", { value: 1 });
});

...
```
