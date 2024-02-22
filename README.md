# Websocket

Websocket (server/client). Light, fast and secure.

## Pack

1. npm run pack
2. Copy the file "cimo-websocket-x.x.x.tgz" in the project root folder.
3. In the "package.json" file insert: "@cimo/websocket": "file:cimo-websocket-x.x.x.tgz"

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

const cwsServer = new CwsServer(server);

ControllerTester.websocket(cwsServer);

...
```

-   ControllerTester.ts

```
...

import { CwsServer } from "@cimo/websocket";

...

export const websocket = (cwsServer: CwsServer, cp: Cp) => {
    cwsServer.receiveData("action_test", (clientId, data) => {
        if (typeof data === "string") {
            cwsServer.sendData(clientId, 1, JSON.stringify({ test: "end" }), "action_test");
        }
    });
};

...
```

## Client

-   Index.ts

```
...

import CwsClient from "@cimo/websocket/dist/client/Service";

...

const cwsClient = new CwsClient("wss://localhost");

cwsClient.checkConnection(() => {
    cwsClient.receiveData("action_test", (data) => {
        if (typeof data === "string") {
            const message = JSON.parse(data) as Record<string, string>;

            console.log(message);
        }
    });
});

elementButton.addEventListener("click", (event) => {
    cwsClient.sendData(1, JSON.stringify({ test: "start" }), "action_test");
});

...
```
