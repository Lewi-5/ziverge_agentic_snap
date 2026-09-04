import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createNodeHttpServerAdapter } from "../src/adapters/node-http-server-adapter.js";
function requestHelper(options) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                resolve({
                    status: res.statusCode ?? 0,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                });
            });
        });
        req.on("error", reject);
        req.end();
    });
}
test("NodeHttpServerAdapter serves GET /repository.json snapshot bytes", async () => {
    const adapter = createNodeHttpServerAdapter();
    const snapshot = Buffer.from('{"format":1,"patches":[]}\n', "utf-8");
    const handle = await adapter.listen({
        host: "127.0.0.1",
        port: 0,
        snapshotBytes: new Uint8Array(snapshot),
    });
    assert.ok(handle.port > 0);
    try {
        const res = await requestHelper({
            host: "127.0.0.1",
            port: handle.port,
            path: "/repository.json",
            method: "GET",
        });
        assert.equal(res.status, 200);
        assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
        assert.equal(res.headers["content-length"], String(snapshot.length));
        assert.deepEqual(res.body, snapshot);
    }
    finally {
        await handle.close();
    }
});
test("NodeHttpServerAdapter serves HEAD /repository.json with zero body bytes", async () => {
    const adapter = createNodeHttpServerAdapter();
    const snapshot = Buffer.from('{"format":1}\n', "utf-8");
    const handle = await adapter.listen({
        host: "127.0.0.1",
        port: 0,
        snapshotBytes: new Uint8Array(snapshot),
    });
    try {
        const res = await requestHelper({
            host: "127.0.0.1",
            port: handle.port,
            path: "/repository.json",
            method: "HEAD",
        });
        assert.equal(res.status, 200);
        assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
        assert.equal(res.body.length, 0);
    }
    finally {
        await handle.close();
    }
});
test("NodeHttpServerAdapter rejects non-matching paths and queries with 404", async () => {
    const adapter = createNodeHttpServerAdapter();
    const snapshot = Buffer.from('{"format":1}\n', "utf-8");
    const handle = await adapter.listen({
        host: "127.0.0.1",
        port: 0,
        snapshotBytes: new Uint8Array(snapshot),
    });
    try {
        const resUnknown = await requestHelper({
            host: "127.0.0.1",
            port: handle.port,
            path: "/unknown",
            method: "GET",
        });
        assert.equal(resUnknown.status, 404);
        const resQuery = await requestHelper({
            host: "127.0.0.1",
            port: handle.port,
            path: "/repository.json?query=1",
            method: "GET",
        });
        assert.equal(resQuery.status, 404);
    }
    finally {
        await handle.close();
    }
});
test("NodeHttpServerAdapter rejects unsupported methods with 405 and Allow header", async () => {
    const adapter = createNodeHttpServerAdapter();
    const snapshot = Buffer.from('{"format":1}\n', "utf-8");
    const handle = await adapter.listen({
        host: "127.0.0.1",
        port: 0,
        snapshotBytes: new Uint8Array(snapshot),
    });
    try {
        const resPost = await requestHelper({
            host: "127.0.0.1",
            port: handle.port,
            path: "/repository.json",
            method: "POST",
        });
        assert.equal(resPost.status, 405);
        assert.equal(resPost.headers["allow"], "GET, HEAD");
    }
    finally {
        await handle.close();
    }
});
