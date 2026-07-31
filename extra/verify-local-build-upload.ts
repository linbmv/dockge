import { execFile } from "node:child_process";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { StackFileUploadManager } from "../backend/stack-file-upload";
import { Stack } from "../backend/stack";
import type { DockgeServer } from "../backend/dockge-server";
import type { DockgeSocket } from "../backend/util-server";

const execFileAsync = promisify(execFile);
const stackName = `upload-verify-${process.pid}-${Date.now()}`;
const imageName = `dockge-${stackName}:test`;
const expectedContent = "uploaded-local-build-context";
const composeYAML = `services:
  verify:
    image: ${imageName}
    build: .
    environment:
      EXPECTED: \${EXPECTED:?Set EXPECTED in .env}
    command: ["sh", "-c", 'grep -qx "$$EXPECTED" /verification.txt && sleep 60']
`;

const stacksDir = await fsAsync.mkdtemp(path.join(os.tmpdir(), "dockge-local-build-upload-"));
const stackDir = path.join(stacksDir, stackName);

try {
    const uploadManager = new StackFileUploadManager();
    const uploadID = await uploadManager.begin(stacksDir, "verification-socket", stackName);
    const dockerfile = Buffer.from("FROM alpine:3.21\nCOPY verification.txt /verification.txt\n");
    const splitAt = Math.floor(dockerfile.byteLength / 2);
    await uploadManager.writeChunk("verification-socket", uploadID, "Dockerfile", 0, dockerfile.subarray(0, splitAt));
    await uploadManager.writeChunk("verification-socket", uploadID, "Dockerfile", splitAt, dockerfile.subarray(splitAt));
    await uploadManager.writeChunk("verification-socket", uploadID, "verification.txt", 0, Buffer.from(`${expectedContent}\n`));
    await uploadManager.finish("verification-socket", uploadID);

    const server = { stacksDir } as DockgeServer;
    const stack = new Stack(server, stackName, composeYAML, `EXPECTED=${expectedContent}\n`);
    await stack.save(false);

    const socket = {
        id: "verification-socket",
        endpoint: "",
        connected: true,
        emitAgent: () => {},
    } as unknown as DockgeSocket;
    await stack.deploy(socket);

    const { stdout: containerID } = await execFileAsync("docker", [
        "compose",
        "-p",
        stackName,
        "ps",
        "--status",
        "running",
        "--quiet",
        "verify",
    ], { cwd: stackDir });
    if (!containerID.trim()) {
        throw new Error("The verification container is not running");
    }

    const { stdout: uploadedContent } = await execFileAsync("docker", [
        "exec",
        containerID.trim(),
        "cat",
        "/verification.txt",
    ]);
    if (uploadedContent.trim() !== expectedContent) {
        throw new Error("The built image does not contain the uploaded project file");
    }

    const savedEnv = await fsAsync.readFile(path.join(stackDir, ".env"), "utf-8");
    if (savedEnv !== `EXPECTED=${expectedContent}\n`) {
        throw new Error("The uploaded Stack did not persist its .env content");
    }

    console.log(`Local build upload verified with container ${containerID.trim().slice(0, 12)}.`);
} finally {
    if (await fsAsync.access(stackDir).then(() => true).catch(() => false)) {
        await execFileAsync("docker", [
            "compose",
            "-p",
            stackName,
            "down",
            "--rmi",
            "local",
            "--remove-orphans",
        ], { cwd: stackDir }).catch(() => undefined);
    }
    await execFileAsync("docker", [ "image", "rm", "--force", imageName ]).catch(() => undefined);
    await fsAsync.rm(stacksDir, {
        recursive: true,
        force: true,
    });
}
