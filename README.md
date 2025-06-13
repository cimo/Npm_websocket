# Npm_websocket

Npm package, websocket (server/client). Light, fast and secure.
Writed with native Typescript code and no dependencies are used.

## Pack

1. npm run pack
2. Copy the file "package_name-x.x.x.tgz" in the project root folder.
3. In the "package.json" file insert: "@cimo/package_name": "file:package_name-x.x.x.tgz"

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

const cwsServer = new CwsServer(server, "secret-key");

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
            const requestWsData = { test: "end" } as Record<string, string>;
            cwsServer.sendData(clientId, 1, JSON.stringify(requestWsData), "action_test");
        }
    });
};

...
```

## Client

-   Client.ts

```
...

import CwsClient from "@cimo/websocket/dist/client/Manager";

...

const cwsClient = new CwsClient("wss://localhost");

cwsClient.checkConnection(() => {
    cwsClient.receiveData("action_test", (data) => {
        if (typeof data === "string") {
            const responseWsData = JSON.parse(data) as Record<string, string>;

            console.log(responseWsData);
        }
    });
});

elementButton.addEventListener("click", (event) => {
    const requestWsData = { test: "start" } as Record<string, string>;
    cwsClient.sendData(1, JSON.stringify(requestWsData), "action_test");
});

...
```
