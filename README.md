# Websocket

Websocket API (server/client). Light, fast and secure.

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

import { CwsServerMessage } from "@cimo/websocket";

// Source
import * as ControllerTest from "../controller/Test";

...

CwsServerMessage.create(server);

CwsServerMessage.receiveOutput("test", (socket, data) => {
    ControllerTest.websocket(socket, data);
});

...
```

-   ControllerTest.ts

```
...

import { CwsServerInterface, CwsServerMessage } from "@cimo/websocket";

...

export const websocket = (socket: CwsServerInterface.Isocket, data: CwsServerInterface.Imessage) => {
    const tag = data.tag;
    const message = data.message;

    if (tag === "cws_test_o") {
        CwsServerMessage.sendInput(socket, "test", message);
    }
};

...
```

## Client

-   index.ts

```
...

import * as CwsClient from "@cimo/websocket/dist/client/Message";

...

CwsClient.connection(window.location.host);

CwsClient.receiveMessage("broadcast", (data) => {
    // Global event
});

CwsClient.receiveMessage("test", (data) => {
    // Test event
});

...

elementButton.addEventListener("click", (event) => {
    CwsClient.sendMessage("test", { value: 1 });
});

...
```
