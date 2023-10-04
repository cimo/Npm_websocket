# Websocket

Websocket API (server and client) fast and secure.

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
import * as ControllerRun from "../controller/Run";

...

CwsServerMessage.create(server);
CwsServerMessage.readOutput("run", (data) => {
    ControllerRun.websocket(data);
});

...
```

-   ControllerRun.ts

```
...

import { CwsServerInterface } from "@cimo/websocket";

...

export const websocket = (data: CwsServerInterface.Imessage) => {
    console.log("run", data);
};

...
```

## Client

-   index.ts

```
...

import * as CwsClient from "@cimo/websocket/dist/client/Message";

...

CwsClient.connection("localhost:1002");

CwsClient.readMessage("broadcast", () => {
    // global event
});

CwsClient.readMessage("run", () => {
    // run event
});

...

elementButton.addEventListener("click", (event) => {
    CwsClient.sendMessage("run", { test: 1 });
});

...
```
