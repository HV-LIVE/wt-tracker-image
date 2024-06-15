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
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _UWebSocketsTracker_app;
import { StringDecoder } from "string_decoder";
import { App, SSLApp, } from "uWebSockets.js";
import Debug from "debug";
import { TrackerError } from "./tracker.js";
const debugWebSockets = Debug("wt-tracker:uws-tracker");
const debugWebSocketsEnabled = debugWebSockets.enabled;
const debugMessages = Debug("wt-tracker:uws-tracker-messages");
const debugMessagesEnabled = debugMessages.enabled;
const debugRequests = Debug("wt-tracker:uws-tracker-requests");
const debugRequestsEnabled = debugRequests.enabled;
const decoder = new StringDecoder();
export class UWebSocketsTracker {
    constructor(tracker, settings) {
        this.webSocketsCount = 0;
        this.validateOrigin = false;
        _UWebSocketsTracker_app.set(this, void 0);
        this.onOpen = () => {
            this.webSocketsCount++;
        };
        this.onUpgrade = (response, request, context) => {
            if (this.maxConnections !== 0 &&
                this.webSocketsCount > this.maxConnections) {
                if (debugRequestsEnabled) {
                    debugRequests(this.settings.server.host, this.settings.server.port, "ws-denied-max-connections url:", request.getUrl(), "query:", request.getQuery(), "origin:", request.getHeader("origin"), "total:", this.webSocketsCount);
                }
                response.close();
                return;
            }
            if (debugWebSocketsEnabled) {
                debugWebSockets("connected via URL", request.getUrl());
            }
            if (this.validateOrigin) {
                const origin = request.getHeader("origin");
                const shoulDeny = (this.settings.access.denyEmptyOrigin && origin.length === 0) ||
                    this.settings.access.denyOrigins?.includes(origin) === true ||
                    this.settings.access.allowOrigins?.includes(origin) === false;
                if (shoulDeny) {
                    if (debugRequestsEnabled) {
                        debugRequests(this.settings.server.host, this.settings.server.port, "ws-denied url:", request.getUrl(), "query:", request.getQuery(), "origin:", origin, "total:", this.webSocketsCount);
                    }
                    response.close();
                    return;
                }
            }
            if (debugRequestsEnabled) {
                debugRequests(this.settings.server.host, this.settings.server.port, "ws-open url:", request.getUrl(), "query:", request.getQuery(), "origin:", request.getHeader("origin"), "total:", this.webSocketsCount);
            }
            response.upgrade({
                sendMessage,
            }, request.getHeader("sec-websocket-key"), request.getHeader("sec-websocket-protocol"), request.getHeader("sec-websocket-extensions"), context);
        };
        this.onMessage = (ws, message) => {
            debugWebSockets("message of size", message.byteLength);
            const userData = ws.getUserData();
            userData.ws = ws;
            let json = undefined;
            try {
                json = JSON.parse(decoder.end(new Uint8Array(message)));
            }
            catch (e) {
                debugWebSockets("failed to parse JSON message", e);
                ws.close();
                return;
            }
            if (debugMessagesEnabled) {
                debugMessages("in", userData.id === undefined
                    ? "unknown peer"
                    : Buffer.from(userData.id).toString("hex"), json);
            }
            try {
                this.tracker.processMessage(json, userData);
            }
            catch (e) {
                if (e instanceof TrackerError) {
                    debugWebSockets("failed to process message from the peer:", e);
                    ws.close();
                }
                else {
                    throw e;
                }
            }
        };
        this.onClose = (ws, code) => {
            this.webSocketsCount--;
            if (ws.getUserData().sendMessage !== undefined) {
                this.tracker.disconnectPeer(ws);
            }
            debugWebSockets("closed with code", code);
        };
        this.tracker = tracker;
        this.settings = {
            server: {
                port: 8000,
                host: "0.0.0.0",
                ...settings.server,
            },
            websockets: {
                path: "/*",
                maxPayloadLength: 64 * 1024,
                idleTimeout: 240,
                compression: 1,
                maxConnections: 0,
                ...settings.websockets,
            },
            access: {
                allowOrigins: undefined,
                denyOrigins: undefined,
                denyEmptyOrigin: false,
                ...settings.access,
            },
        };
        this.maxConnections = this.settings.websockets.maxConnections;
        this.validateAccess();
        __classPrivateFieldSet(this, _UWebSocketsTracker_app, this.settings.server.key_file_name === undefined
            ? App(this.settings.server)
            : SSLApp(this.settings.server), "f");
        this.buildApplication();
    }
    get app() {
        return __classPrivateFieldGet(this, _UWebSocketsTracker_app, "f");
    }
    get stats() {
        return {
            webSocketsCount: this.webSocketsCount,
        };
    }
    async run() {
        await new Promise((resolve, reject) => {
            __classPrivateFieldGet(this, _UWebSocketsTracker_app, "f").listen(this.settings.server.host, this.settings.server.port, (token) => {
                if (token === false) {
                    reject(new Error(`failed to listen to ${this.settings.server.host}:${this.settings.server.port}`));
                }
                else {
                    resolve();
                }
            });
        });
    }
    validateAccess() {
        if (this.settings.access.allowOrigins !== undefined) {
            if (this.settings.access.denyOrigins !== undefined) {
                throw new Error("allowOrigins and denyOrigins can't be set simultaneously");
            }
            else if (!(this.settings.access.allowOrigins instanceof Array)) {
                throw new Error("allowOrigins configuration paramenters should be an array of strings");
            }
        }
        else if (this.settings.access.denyOrigins !== undefined &&
            !(this.settings.access.denyOrigins instanceof Array)) {
            throw new Error("denyOrigins configuration paramenters should be an array of strings");
        }
        const origins = this.settings.access.allowOrigins ?? this.settings.access.denyOrigins;
        if (origins !== undefined) {
            for (const origin of origins) {
                if (typeof origin !== "string") {
                    throw new Error("allowOrigins and denyOrigins configuration paramenters should be arrays of strings");
                }
            }
        }
        this.validateOrigin =
            this.settings.access.denyEmptyOrigin ||
                this.settings.access.allowOrigins !== undefined ||
                this.settings.access.denyOrigins !== undefined;
    }
    buildApplication() {
        __classPrivateFieldGet(this, _UWebSocketsTracker_app, "f").ws(this.settings.websockets.path, {
            compression: this.settings.websockets.compression,
            maxPayloadLength: this.settings.websockets.maxPayloadLength,
            idleTimeout: this.settings.websockets.idleTimeout,
            open: this.onOpen,
            upgrade: this.onUpgrade,
            drain: (ws) => {
                if (debugWebSocketsEnabled) {
                    debugWebSockets("drain", ws.getBufferedAmount());
                }
            },
            message: this.onMessage,
            close: this.onClose,
        });
    }
}
_UWebSocketsTracker_app = new WeakMap();
function sendMessage(json, peerContext) {
    peerContext.ws.send(JSON.stringify(json), false, false);
    if (debugMessagesEnabled) {
        debugMessages("out", peerContext.id === undefined
            ? "unknown peer"
            : Buffer.from(peerContext.id).toString("hex"), json);
    }
}
