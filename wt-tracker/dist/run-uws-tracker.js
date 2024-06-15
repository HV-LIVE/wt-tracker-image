/**
 * Copyright 2019 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable no-console */
import { readFileSync } from "fs";
import Debug from "debug";
import { UWebSocketsTracker } from "./uws-tracker.js";
import { FastTracker } from "./fast-tracker.js";
const debugRequests = Debug("wt-tracker:uws-tracker-requests");
const debugRequestsEnabled = debugRequests.enabled;
async function main() {
    let settingsFileData = undefined;
    if (process.argv.length <= 2) {
        try {
            settingsFileData = readFileSync("config.json");
        }
        catch (e) {
            if (e.code !== "ENOENT") {
                console.error("failed to read configuration file:", e);
                return;
            }
        }
    }
    else {
        try {
            settingsFileData = readFileSync(process.argv[2]);
        }
        catch (e) {
            console.error("failed to read configuration file:", e);
            return;
        }
    }
    let jsonSettings = undefined;
    try {
        jsonSettings =
            settingsFileData === undefined
                ? {}
                : JSON.parse(settingsFileData.toString());
    }
    catch (e) {
        console.error("failed to parse JSON configuration file:", e);
        return;
    }
    const settings = validateSettings(jsonSettings);
    if (settings === undefined) {
        return;
    }
    const tracker = new FastTracker(settings.tracker);
    try {
        await runServers(tracker, settings);
    }
    catch (e) {
        console.error("failed to start the web server:", e);
    }
}
function validateSettings(jsonSettings) {
    if (jsonSettings.servers !== undefined &&
        !(jsonSettings.servers instanceof Array)) {
        console.error("failed to parse JSON configuration file: 'servers' property should be an array");
        return undefined;
    }
    const servers = [];
    if (jsonSettings.servers === undefined) {
        servers.push({});
    }
    else {
        for (const serverSettings of jsonSettings.servers) {
            if (serverSettings instanceof Object) {
                servers.push(serverSettings);
            }
            else {
                console.error("failed to parse JSON configuration file: 'servers' property should be an array of objects");
                return undefined;
            }
        }
    }
    if (jsonSettings.tracker !== undefined &&
        !(jsonSettings.tracker instanceof Object)) {
        console.error("failed to parse JSON configuration file: 'tracker' property should be an object");
        return undefined;
    }
    if (jsonSettings.websocketsAccess !== undefined &&
        !(jsonSettings.websocketsAccess instanceof Object)) {
        console.error("failed to parse JSON configuration file: 'websocketsAccess' property should be an object");
        return undefined;
    }
    return {
        servers,
        tracker: jsonSettings.tracker,
        websocketsAccess: jsonSettings.websocketsAccess,
    };
}
async function runServers(tracker, settings) {
    let indexHtml = undefined;
    try {
        indexHtml = readFileSync("index.html");
    }
    catch (e) {
        if (e.code !== "ENOENT") {
            throw e;
        }
    }
    const servers = [];
    const serverPromises = settings.servers.map(async (serverSettings) => {
        const server = buildServer({
            tracker,
            serverSettings,
            websocketsAccess: settings.websocketsAccess,
            indexHtml,
            servers,
        });
        servers.push(server);
        await server.run();
        console.info(`listening ${server.settings.server.host}:${server.settings.server.port}`);
    });
    await Promise.all(serverPromises);
}
function buildServer({ tracker, serverSettings, websocketsAccess, indexHtml, servers, }) {
    if (!(serverSettings instanceof Object)) {
        throw Error("failed to parse JSON configuration file: 'servers' property should be an array of objects");
    }
    const server = new UWebSocketsTracker(tracker, {
        ...serverSettings,
        access: websocketsAccess,
    });
    server.app
        .get("/", (response, request) => {
        debugRequest(server, request);
        if (indexHtml === undefined) {
            const status = "404 Not Found";
            response.writeStatus(status).end(status);
        }
        else {
            response.end(indexHtml);
        }
    })
        .get("/stats.json", (response, request) => {
        debugRequest(server, request);
        const swarms = tracker.swarms;
        const peersCountPerInfoHash = {};
        let peersCount = 0;
        for (const [infoHash, swarm] of swarms) {
            peersCount += swarm.peers.length;
            const infoHashHex = Buffer.from(infoHash, "binary").toString("hex");
            peersCountPerInfoHash[infoHashHex] = peersCount;
        }
        const serversStats = new Array();
        for (const serverForStats of servers) {
            const { settings } = serverForStats;
            serversStats.push({
                server: `${settings.server.host}:${settings.server.port}`,
                webSocketsCount: serverForStats.stats.webSocketsCount,
            });
        }
        response.writeHeader("Content-Type", "application/json").end(JSON.stringify({
            torrentsCount: swarms.size,
            peersCount,
            servers: serversStats,
            memory: process.memoryUsage(),
            peersCountPerInfoHash,
        }));
    })
        .any("/*", (response, request) => {
        debugRequest(server, request);
        const status = "404 Not Found";
        response.writeStatus(status).end(status);
    });
    return server;
}
function debugRequest(server, request) {
    if (debugRequestsEnabled) {
        debugRequests(server.settings.server.host, server.settings.server.port, "request method:", request.getMethod(), "url:", request.getUrl(), "query:", request.getQuery());
    }
}
async function run() {
    try {
        await main();
    }
    catch (e) {
        console.error(e);
    }
}
await run();
