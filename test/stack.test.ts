import assert from "node:assert/strict";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Stack } from "../backend/stack";
import { Terminal } from "../backend/terminal";
import type { DockgeServer } from "../backend/dockge-server";
import type { DockgeSocket } from "../backend/util-server";

async function temporaryStacksDir(t : TestContext) {
    const dir = await fsAsync.mkdtemp(path.join(os.tmpdir(), "dockge-stack-test-"));
    t.after(async () => {
        await fsAsync.rm(dir, {
            recursive: true,
            force: true,
        });
    });
    return dir;
}

test("saving a stack persists and can clear its .env file", async (t) => {
    const stacksDir = await temporaryStacksDir(t);
    const server = { stacksDir } as DockgeServer;
    const composeYAML = "services:\n  app:\n    image: nginx\n";

    const created = new Stack(server, "env-app", composeYAML, "TOKEN=initial\n");
    await created.save(true);
    assert.equal(await fsAsync.readFile(path.join(stacksDir, "env-app", ".env"), "utf-8"), "TOKEN=initial\n");

    const edited = new Stack(server, "env-app", composeYAML, "");
    await edited.save(false);
    assert.equal(await fsAsync.readFile(path.join(stacksDir, "env-app", ".env"), "utf-8"), "");
});

test("saving an empty new .env does not create an unnecessary file", async (t) => {
    const stacksDir = await temporaryStacksDir(t);
    const server = { stacksDir } as DockgeServer;
    const stack = new Stack(server, "empty-env", "services:\n  app:\n    image: nginx\n", "");

    await stack.save(true);
    await assert.rejects(fsAsync.access(path.join(stacksDir, "empty-env", ".env")));
});

test("git pull and build checks bind mounts after pulling the updated Compose file", async (t) => {
    const stacksDir = await temporaryStacksDir(t);
    const server = { stacksDir } as DockgeServer;
    const stackPath = path.join(stacksDir, "git-app");
    await fsAsync.mkdir(path.join(stackPath, ".git"), { recursive: true });
    await fsAsync.writeFile(path.join(stackPath, "compose.yaml"), "services:\n  app:\n    image: nginx\n");

    const calls: string[] = [];
    const originalExec = Terminal.exec;
    Terminal.exec = (async (_server, _socket, _terminalName, file) => {
        calls.push(file);
        return 0;
    }) as typeof Terminal.exec;
    t.after(() => {
        Terminal.exec = originalExec;
    });

    const stack = new Stack(server, "git-app");
    stack.requireBindMountSources = async () => {
        calls.push("bind-preflight");
    };

    await stack.gitPullAndBuild({ endpoint: "" } as DockgeSocket);
    assert.deepEqual(calls, [ "env", "bind-preflight", "docker" ]);
});
