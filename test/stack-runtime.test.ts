import assert from "node:assert/strict";
import test from "node:test";
import { extractStackRuntimeTargets } from "../common/stack-runtime";

test("runtime targets use real container names and shared-network addresses", () => {
    assert.deepEqual(extractStackRuntimeTargets([
        {
            name: "octopus-worker",
            internalIP: "",
        },
        {
            name: "cpa",
            internalIP: "172.18.0.101",
            internalNetwork: "D_Home",
        },
        {
            name: "octopus-worker",
            internalIP: "172.18.0.105",
            internalNetwork: "D_Home",
        },
        {
            name: "cpa",
        },
        {
            name: " ",
            internalIP: "172.18.0.200",
        },
        null,
    ]), [
        {
            name: "cpa",
            internalIP: "172.18.0.101",
            internalNetwork: "D_Home",
        },
        {
            name: "octopus-worker",
            internalIP: "172.18.0.105",
            internalNetwork: "D_Home",
        },
    ]);
});
