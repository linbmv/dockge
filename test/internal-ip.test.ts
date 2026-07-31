import assert from "node:assert/strict";
import test from "node:test";
import {
    applyInternalIPAllocations,
    findAvailableInternalIP,
    internalIPCandidates,
    servicesNeedingInternalIP,
} from "../common/internal-ip";

test("internal IP allocation follows ComposeMgt order and skips reserved addresses", () => {
    const candidates = internalIPCandidates("172.18.0");
    assert.equal(candidates[0], "172.18.0.100");
    assert.equal(candidates.at(-1), "172.18.0.99");
    assert.equal(candidates.includes("172.18.0.254"), false);

    const used = new Set([ "172.18.0.100", "172.18.0.101", "172.18.0.102" ]);
    assert.equal(findAvailableInternalIP("172.18.0", used), "172.18.0.103");
    assert.equal(
        findAvailableInternalIP("172.18.0", new Set(candidates.slice(0, 154))),
        "172.18.0.2"
    );
});

test("services needing an internal IP preserves service order and skips explicit addresses", () => {
    const config = {
        services: {
            first: { networks: [ "D_Home" ] },
            second: {
                networks: {
                    D_Home: {
                        ipv4_address: "172.18.0.115",
                    },
                },
            },
            isolated: { networks: [ "other" ] },
            hostMode: {
                network_mode: "host",
                networks: [ "D_Home" ],
            },
            third: { networks: { D_Home: {} } },
        },
    };

    assert.deepEqual(servicesNeedingInternalIP(config, "D_Home"), [ "first", "third" ]);
});

test("applying allocations converts network arrays to Compose mapping syntax", () => {
    const config = {
        services: {
            app: {
                image: "example/app",
                networks: [ "frontend", "D_Home" ],
            },
        },
    };

    assert.equal(applyInternalIPAllocations(config, "D_Home", [
        {
            serviceName: "app",
            ipAddress: "172.18.0.115",
        },
    ]), 1);
    assert.deepEqual(config.services.app.networks, {
        frontend: {},
        D_Home: { ipv4_address: "172.18.0.115" },
    });
});
