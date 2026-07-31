import assert from "node:assert/strict";
import test from "node:test";
import { ensureDockerNetwork } from "../backend/docker-network";

test("keeps an existing default external network", async () => {
    let createCalls = 0;
    const result = await ensureDockerNetwork(
        "D_Home",
        async () => [ "D_Home" ],
        async () => {
            createCalls += 1;
        }
    );

    assert.equal(result, "existing");
    assert.equal(createCalls, 0);
});

test("creates a missing default external network", async () => {
    const created : string[] = [];
    const result = await ensureDockerNetwork(
        "D_Home",
        async () => [],
        async name => {
            created.push(name);
        }
    );

    assert.equal(result, "created");
    assert.deepEqual(created, [ "D_Home" ]);
});

test("accepts a concurrent create of the same network", async () => {
    let listCalls = 0;
    const result = await ensureDockerNetwork(
        "D_Home",
        async () => listCalls++ === 0 ? [] : [ "D_Home" ],
        async () => {
            throw new Error("already exists");
        }
    );

    assert.equal(result, "existing");
});

test("reports a network creation failure", async () => {
    await assert.rejects(
        ensureDockerNetwork(
            "D_Home",
            async () => [],
            async () => {
                throw new Error("docker unavailable");
            }
        ),
        /docker unavailable/
    );
});
