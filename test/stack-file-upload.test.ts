import assert from "node:assert/strict";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
    findProjectComposeFile,
    STACK_UPLOAD_CHUNK_MAX_BYTES,
    removeDirectoryUploadRoot,
    stackNameFromProjectRoot
} from "../common/stack-file-upload";
import {
    normalizeStackUploadPath,
    StackFileUploadManager
} from "../backend/stack-file-upload";

async function temporaryStacksDir(t : TestContext) {
    const dir = await fsAsync.mkdtemp(path.join(os.tmpdir(), "dockge-stack-upload-test-"));
    t.after(async () => {
        await fsAsync.rm(dir, {
            recursive: true,
            force: true,
        });
    });
    return dir;
}

test("removes the browser directory-picker root", () => {
    assert.equal(removeDirectoryUploadRoot("project/src/index.ts"), "src/index.ts");
    assert.equal(removeDirectoryUploadRoot("Dockerfile"), "Dockerfile");
});

test("finds the Compose file selected with a local project", () => {
    assert.equal(findProjectComposeFile([
        "src/index.ts",
        "docker-compose.yml",
        "Dockerfile",
    ]), "docker-compose.yml");
    assert.equal(findProjectComposeFile([
        "docker-compose.yml",
        "compose.yaml",
    ]), "compose.yaml");
    assert.equal(findProjectComposeFile([ "Dockerfile" ]), undefined);
});

test("derives a valid stack name from the project folder", () => {
    assert.equal(stackNameFromProjectRoot("Cline-proxy"), "cline-proxy");
    assert.equal(stackNameFromProjectRoot(" My Local App "), "my-local-app");
    assert.equal(stackNameFromProjectRoot("___"), "___");
});

test("rejects absolute and traversal upload paths", () => {
    assert.throws(() => normalizeStackUploadPath("../secret"), /must not contain/);
    assert.throws(() => normalizeStackUploadPath("src/../secret"), /must not contain/);
    assert.throws(() => normalizeStackUploadPath("/etc/passwd"), /must be relative/);
    assert.throws(() => normalizeStackUploadPath("src\\index.ts"), /must be relative/);
    assert.throws(() => normalizeStackUploadPath("src//index.ts"), /must not contain/);
});

test("uploads chunks into a temporary directory and publishes atomically", async (t) => {
    const stacksDir = await temporaryStacksDir(t);
    const manager = new StackFileUploadManager();
    const uploadID = await manager.begin(stacksDir, "socket-a", "local-app");

    assert.equal(await fsAsync.stat(path.join(stacksDir, "local-app")).catch(() => undefined), undefined);
    await manager.writeChunk("socket-a", uploadID, "Dockerfile", 0, Buffer.from("FROM "));
    await manager.writeChunk("socket-a", uploadID, "Dockerfile", 5, Buffer.from("scratch\n"));
    await manager.writeChunk("socket-a", uploadID, "src/empty.txt", 0, Buffer.alloc(0));
    await manager.finish("socket-a", uploadID);

    assert.equal(await fsAsync.readFile(path.join(stacksDir, "local-app", "Dockerfile"), "utf-8"), "FROM scratch\n");
    assert.equal((await fsAsync.stat(path.join(stacksDir, "local-app", "src", "empty.txt"))).size, 0);
    assert.deepEqual((await fsAsync.readdir(stacksDir)).filter(name => name.startsWith(".dockge-upload-")), []);
});

test("enforces upload ownership, ordering and chunk limits", async (t) => {
    const stacksDir = await temporaryStacksDir(t);
    const manager = new StackFileUploadManager();
    const uploadID = await manager.begin(stacksDir, "socket-a", "local-app");

    await assert.rejects(
        manager.writeChunk("socket-b", uploadID, "Dockerfile", 0, Buffer.from("FROM scratch")),
        /session was not found/
    );
    await assert.rejects(
        manager.writeChunk("socket-a", uploadID, "Dockerfile", 1, Buffer.from("x")),
        /out of order/
    );
    await assert.rejects(
        manager.writeChunk("socket-a", uploadID, "Dockerfile", 0, Buffer.alloc(STACK_UPLOAD_CHUNK_MAX_BYTES + 1)),
        /chunk is too large/
    );

    await manager.cancel("socket-a", uploadID);
    assert.deepEqual(await fsAsync.readdir(stacksDir), []);
});

test("refuses to publish over an existing stack", async (t) => {
    const stacksDir = await temporaryStacksDir(t);
    const manager = new StackFileUploadManager();
    await fsAsync.mkdir(path.join(stacksDir, "existing"));

    await assert.rejects(manager.begin(stacksDir, "socket-a", "existing"), /already exists/);
});

test("allows only one active upload per socket", async (t) => {
    const stacksDir = await temporaryStacksDir(t);
    const manager = new StackFileUploadManager();
    const uploadID = await manager.begin(stacksDir, "socket-a", "first");

    await assert.rejects(manager.begin(stacksDir, "socket-a", "second"), /already running/);
    await manager.cancel("socket-a", uploadID);
    const nextUploadID = await manager.begin(stacksDir, "socket-a", "second");
    await manager.cancel("socket-a", nextUploadID);
});
