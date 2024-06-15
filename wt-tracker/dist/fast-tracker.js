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
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _FastTracker_swarms, _FastTracker_peers, _Swarm_peers;
import Debug from "debug";
import { TrackerError } from "./tracker.js";
const debug = Debug("wt-tracker:fast-tracker");
const debugEnabled = debug.enabled;
export class FastTracker {
    constructor(settings) {
        _FastTracker_swarms.set(this, new Map());
        _FastTracker_peers.set(this, new Map());
        this.settings = {
            maxOffers: 20,
            announceInterval: 120,
            ...settings,
        };
    }
    get swarms() {
        return __classPrivateFieldGet(this, _FastTracker_swarms, "f");
    }
    processMessage(jsonObject, peer) {
        const json = jsonObject;
        const action = json.action;
        if (action === "announce") {
            const event = json.event;
            if (event === undefined) {
                if (json.answer === undefined) {
                    this.processAnnounce(json, peer);
                }
                else {
                    this.processAnswer(json, peer);
                }
            }
            else if (event === "started") {
                this.processAnnounce(json, peer);
            }
            else if (event === "stopped") {
                this.processStop(json, peer);
            }
            else if (event === "completed") {
                this.processAnnounce(json, peer, true);
            }
            else {
                throw new TrackerError("unknown announce event");
            }
        }
        else if (action === "scrape") {
            this.processScrape(json, peer);
        }
        else {
            throw new TrackerError("unknown action");
        }
    }
    disconnectPeer(peer) {
        const peerId = peer.id;
        if (peerId === undefined) {
            return;
        }
        if (debugEnabled) {
            debug("disconnect peer:", Buffer.from(peerId).toString("hex"));
        }
        for (const infoHash in peer) {
            const swarm = peer[infoHash];
            if (!(swarm instanceof Swarm)) {
                continue;
            }
            swarm.removePeer(peer);
            delete peer[infoHash];
            if (debugEnabled) {
                debug("disconnect peer: peer", Buffer.from(peerId).toString("hex"), "removed from swarm", Buffer.from(infoHash).toString("hex"));
            }
            if (swarm.peers.length === 0) {
                if (debugEnabled) {
                    debug("disconnect peer: swarm removed (empty)", Buffer.from(swarm.infoHash).toString("hex"));
                }
                __classPrivateFieldGet(this, _FastTracker_swarms, "f").delete(swarm.infoHash);
            }
        }
        __classPrivateFieldGet(this, _FastTracker_peers, "f").delete(peerId);
        peer.id = undefined;
    }
    processAnnounce(json, peer, completed = false) {
        const infoHash = json.info_hash;
        const peerId = json.peer_id;
        let swarm = undefined;
        if (peer.id === undefined) {
            if (typeof peerId !== "string") {
                throw new TrackerError("announce: peer_id field is missing or wrong");
            }
            peer.id = peerId;
            const oldPeer = __classPrivateFieldGet(this, _FastTracker_peers, "f").get(peerId);
            if (oldPeer !== undefined) {
                this.disconnectPeer(oldPeer);
            }
            __classPrivateFieldGet(this, _FastTracker_peers, "f").set(peerId, peer);
        }
        else if (peer.id === peerId) {
            swarm = peer[infoHash];
        }
        else {
            throw new TrackerError("announce: different peer_id on the same connection");
        }
        const isPeerCompleted = completed || json.left === 0;
        if (swarm === undefined) {
            swarm = this.addPeerToSwarm(peer, infoHash, isPeerCompleted);
        }
        else if (swarm instanceof Swarm) {
            if (debugEnabled) {
                debug("announce: peer", Buffer.from(peer.id).toString("hex"), "in swarm", Buffer.from(infoHash).toString("hex"));
            }
            if (isPeerCompleted) {
                swarm.setCompleted(peer);
            }
        }
        else {
            throw new TrackerError("announce: illegal info_hash field");
        }
        peer.sendMessage({
            action: "announce",
            interval: this.settings.announceInterval,
            info_hash: infoHash,
            complete: swarm.completedCount,
            incomplete: swarm.peers.length - swarm.completedCount,
        }, peer);
        this.sendOffersToPeers(json, swarm.peers, peer, infoHash);
    }
    addPeerToSwarm(peer, infoHash, completed) {
        let swarm = __classPrivateFieldGet(this, _FastTracker_swarms, "f").get(infoHash);
        if (swarm === undefined) {
            if (typeof infoHash !== "string") {
                throw new TrackerError("announce: info_hash field is missing or wrong");
            }
            if (debugEnabled) {
                debug("announce: swarm created:", Buffer.from(infoHash).toString("hex"));
            }
            swarm = new Swarm(infoHash);
            __classPrivateFieldGet(this, _FastTracker_swarms, "f").set(infoHash, swarm);
        }
        if (debugEnabled) {
            debug("announce: peer", Buffer.from(peer.id).toString("hex"), "added to swarm", Buffer.from(infoHash).toString("hex"));
        }
        swarm.addPeer(peer, completed);
        peer[infoHash] = swarm;
        return swarm;
    }
    sendOffersToPeers(json, peers, peer, infoHash) {
        if (peers.length <= 1) {
            return;
        }
        const offers = json.offers;
        if (offers === undefined) {
            return;
        }
        else if (!(offers instanceof Array)) {
            throw new TrackerError("announce: offers field is not an array");
        }
        const numwant = json.numwant;
        if (!Number.isInteger(numwant)) {
            return;
        }
        const countPeersToSend = peers.length - 1;
        const countOffersToSend = Math.min(countPeersToSend, offers.length, this.settings.maxOffers, numwant);
        if (countOffersToSend === countPeersToSend) {
            // we have offers for all the peers from the swarm - send offers to all
            const offersIterator = offers.values();
            for (const toPeer of peers) {
                if (toPeer !== peer) {
                    sendOffer(offersIterator.next().value, peer.id, toPeer, infoHash);
                }
            }
        }
        else {
            // send offers to random peers
            let peerIndex = Math.floor(Math.random() * peers.length);
            for (let i = 0; i < countOffersToSend; i++) {
                const toPeer = peers[peerIndex];
                if (toPeer === peer) {
                    i--; // do one more iteration
                }
                else {
                    sendOffer(offers[i], peer.id, toPeer, infoHash);
                }
                peerIndex++;
                if (peerIndex === peers.length) {
                    peerIndex = 0;
                }
            }
        }
        debug("announce: sent offers", countOffersToSend < 0 ? 0 : countOffersToSend);
    }
    processAnswer(json, peer) {
        const toPeerId = json.to_peer_id;
        const toPeer = __classPrivateFieldGet(this, _FastTracker_peers, "f").get(toPeerId);
        if (toPeer === undefined) {
            throw new TrackerError("answer: to_peer_id is not in the swarm");
        }
        json.peer_id = peer.id;
        delete json.to_peer_id;
        toPeer.sendMessage(json, toPeer);
        if (debugEnabled) {
            debug("answer: from peer", Buffer.from(peer.id).toString("hex"), "to peer", Buffer.from(toPeerId).toString("hex"));
        }
    }
    processStop(json, peer) {
        const infoHash = json.info_hash;
        const swarm = peer[infoHash];
        if (!(swarm instanceof Swarm)) {
            debug("stop event: peer not in the swarm");
            return;
        }
        if (debugEnabled) {
            debug("stop event: peer", Buffer.from(peer.id).toString("hex"), "removed from swarm", Buffer.from(infoHash).toString("hex"));
        }
        swarm.removePeer(peer);
        delete peer[infoHash];
        if (swarm.peers.length === 0) {
            if (debugEnabled) {
                debug("stop event: swarm removed (empty)", Buffer.from(infoHash).toString("hex"));
            }
            __classPrivateFieldGet(this, _FastTracker_swarms, "f").delete(infoHash);
        }
    }
    processScrape(json, peer) {
        const infoHash = json.info_hash;
        const files = {};
        if (infoHash === undefined) {
            for (const swarm of __classPrivateFieldGet(this, _FastTracker_swarms, "f").values()) {
                files[swarm.infoHash] = {
                    complete: swarm.completedCount,
                    incomplete: swarm.peers.length - swarm.completedCount,
                    downloaded: swarm.completedCount,
                };
            }
        }
        else if (infoHash instanceof Array) {
            for (const singleInfoHash of infoHash) {
                const swarm = __classPrivateFieldGet(this, _FastTracker_swarms, "f").get(singleInfoHash);
                if (swarm !== undefined) {
                    files[singleInfoHash] = {
                        complete: swarm.completedCount,
                        incomplete: swarm.peers.length - swarm.completedCount,
                        downloaded: swarm.completedCount,
                    };
                }
                else if (typeof singleInfoHash === "string") {
                    files[singleInfoHash] = {
                        complete: 0,
                        incomplete: 0,
                        downloaded: 0,
                    };
                }
            }
        }
        else {
            const swarm = __classPrivateFieldGet(this, _FastTracker_swarms, "f").get(infoHash);
            if (swarm !== undefined) {
                files[infoHash] = {
                    complete: swarm.completedCount,
                    incomplete: swarm.peers.length - swarm.completedCount,
                    downloaded: swarm.completedCount,
                };
            }
            else if (typeof infoHash === "string") {
                files[infoHash] = {
                    complete: 0,
                    incomplete: 0,
                    downloaded: 0,
                };
            }
        }
        peer.sendMessage({ action: "scrape", files }, peer);
    }
}
_FastTracker_swarms = new WeakMap(), _FastTracker_peers = new WeakMap();
class Swarm {
    constructor(infoHash) {
        this.infoHash = infoHash;
        this.completedCount = 0;
        _Swarm_peers.set(this, []);
    }
    get peers() {
        return __classPrivateFieldGet(this, _Swarm_peers, "f");
    }
    addPeer(peer, completed) {
        __classPrivateFieldGet(this, _Swarm_peers, "f").push(peer);
        if (completed) {
            if (this.completedPeers === undefined) {
                this.completedPeers = new Set();
            }
            this.completedPeers.add(peer.id);
            this.completedCount++;
        }
    }
    removePeer(peer) {
        const index = __classPrivateFieldGet(this, _Swarm_peers, "f").indexOf(peer);
        if (this.completedPeers?.delete(peer.id) === true) {
            this.completedCount--;
        }
        // Delete peerId from array without calling splice
        const last = __classPrivateFieldGet(this, _Swarm_peers, "f").pop();
        if (index < __classPrivateFieldGet(this, _Swarm_peers, "f").length) {
            __classPrivateFieldGet(this, _Swarm_peers, "f")[index] = last;
        }
    }
    setCompleted(peer) {
        if (this.completedPeers === undefined) {
            this.completedPeers = new Set();
        }
        if (!this.completedPeers.has(peer.id)) {
            this.completedPeers.add(peer.id);
            this.completedCount++;
        }
    }
}
_Swarm_peers = new WeakMap();
function sendOffer(offerItem, fromPeerId, toPeer, infoHash) {
    if (!(offerItem instanceof Object)) {
        throw new TrackerError("announce: wrong offer item format");
    }
    const offer = offerItem.offer;
    const offerId = offerItem.offer_id;
    if (!(offer instanceof Object)) {
        throw new TrackerError("announce: wrong offer item field format");
    }
    toPeer.sendMessage({
        action: "announce",
        info_hash: infoHash,
        offer_id: offerId, // offerId is not validated to be a string
        peer_id: fromPeerId,
        offer: {
            type: "offer",
            sdp: offer.sdp, // offer.sdp is not validated to be a string
        },
    }, toPeer);
}
