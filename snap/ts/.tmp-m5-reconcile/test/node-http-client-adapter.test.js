import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createNodeHttpClientAdapter } from "../src/adapters/node-http-client-adapter.js";
test("NodeHttpClientAdapter performs single GET and buffers body bytes", async () => {
    const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end('{"ok":true}');
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = server.address().port;
    const client = createNodeHttpClientAdapter();
    try {
        const response = await client.get(`http://127.0.0.1:${String(port)}/test`);
        assert.equal(response.status, 200);
        assert.equal(new TextDecoder().decode(response.body), '{"ok":true}');
        assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
    }
    finally {
        await new Promise((resolve) => server.close(() => resolve()));
    }
});
test("NodeHttpClientAdapter does not follow redirects (SPEC §9)", async () => {
    const server = http.createServer((req, res) => {
        if (req.url === "/redirect") {
            res.writeHead(302, { Location: "/target" });
            res.end("Redirecting");
            return;
        }
        res.writeHead(200);
        res.end("Target reached");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = server.address().port;
    const client = createNodeHttpClientAdapter();
    try {
        const response = await client.get(`http://127.0.0.1:${String(port)}/redirect`);
        assert.equal(response.status, 302);
        assert.equal(response.headers["location"], "/target");
        assert.equal(new TextDecoder().decode(response.body), "Redirecting");
    }
    finally {
        await new Promise((resolve) => server.close(() => resolve()));
    }
});
