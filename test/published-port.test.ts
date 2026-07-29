import assert from "node:assert/strict";
import test from "node:test";
import {
    extractPublishedPortBindings,
    findAvailablePublishedPort,
    formatPublishedPortMapping,
    publishedPortKey,
    resolveRequiredEnvironmentVariable
} from "../common/published-port";

test("extracts Compose short and long published ports", () => {
    assert.deepEqual(extractPublishedPortBindings([
        "${TS_HOST_IP:?Set TS_HOST_IP in Dockge global.env}:20001:8080",
        "20002:8080/udp",
        "8080",
        {
            target: 80,
            published: "20003-20004",
            protocol: "tcp",
        },
    ]), [
        {
            port: 20001,
            protocol: "tcp"
        },
        {
            port: 20002,
            protocol: "udp"
        },
        {
            port: 20003,
            protocol: "tcp"
        },
        {
            port: 20004,
            protocol: "tcp"
        },
    ]);
});

test("extracts Docker display syntax and keeps protocols independent", () => {
    assert.deepEqual(extractPublishedPortBindings([
        "0.0.0.0:21000->80/tcp",
        "[::]:21000->80/udp",
    ]), [
        {
            port: 21000,
            protocol: "tcp"
        },
        {
            port: 21000,
            protocol: "udp"
        },
    ]);
    assert.notEqual(publishedPortKey(21000, "tcp"), publishedPortKey(21000, "udp"));
});

test("formats persistent Tailscale host mappings", () => {
    assert.equal(
        formatPublishedPortMapping("TS_HOST_IP", 22000, 8080, "tcp"),
        "${TS_HOST_IP:?Set TS_HOST_IP in Dockge global.env}:22000:8080"
    );
    assert.equal(
        formatPublishedPortMapping("TS_HOST_IP", 22001, 53, "udp"),
        "${TS_HOST_IP:?Set TS_HOST_IP in Dockge global.env}:22001:53/udp"
    );
});

test("selects the first free port while keeping TCP and UDP independent", () => {
    const used = new Set([
        publishedPortKey(20000, "tcp"),
        publishedPortKey(20001, "udp"),
    ]);
    const reserved = new Set([
        publishedPortKey(20002, "tcp"),
    ]);

    assert.equal(findAvailablePublishedPort(20000, 20002, "tcp", used, reserved), 20001);
    assert.equal(findAvailablePublishedPort(20000, 20002, "udp", used, reserved), 20000);

    used.add(publishedPortKey(20001, "tcp"));
    assert.equal(findAvailablePublishedPort(20000, 20002, "tcp", used, reserved), undefined);
});

test("resolves only the required host variable for frontend preview", () => {
    const yaml = "ports:\n  - \"${TS_HOST_IP:?Set TS_HOST_IP in Dockge global.env}:20001:8080\"\n";
    assert.equal(
        resolveRequiredEnvironmentVariable(yaml, "TS_HOST_IP", "100.64.0.10"),
        "ports:\n  - \"100.64.0.10:20001:8080\"\n"
    );
});
