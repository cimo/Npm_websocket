# Npm_websocket

Npm package, websocket (server/client). Light, fast and secure.
Writed with native Typescript code and no dependencies are used.

## Pack

1. npm run build
2. Copy the file "/build/package_name-x.x.x.tgz" in the project root folder.
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

import { CwsServer } from "@cimo/websocket/dist/src/Main";

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

import { CwsServer } from "@cimo/websocket/dist/src/Main";

...

export const websocket = (cwsServer: CwsServer, cp: Cp) => {
    cwsServer.receiveData("action_test", (clientId, message) => {
        console.log(message);

        cwsServer.sendData(clientId, "text", { test: "end" }, "action_test");
    });
};

...
```

## Client

-   Client.ts

```
...

import CwsClient from "@cimo/websocket/dist/src/client/Manager";

...

const cwsClient = new CwsClient("wss://localhost");

cwsClient.checkConnection(() => {
    cwsClient.receiveData("action_test", (message) => {
        console.log(message);
    });
});

elementButton.addEventListener("click", (event) => {
    cwsClient.sendData("text", { test: "start" }, "action_test");
});

...
```
