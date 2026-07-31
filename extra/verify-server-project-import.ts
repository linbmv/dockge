import { execFile } from "node:child_process";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { copyServerProject, inspectServerProject } from "../backend/server-project";
import { Stack } from "../backend/stack";
import type { DockgeServer } from "../backend/dockge-server";
import type { DockgeSocket } from "../backend/util-server";

const execFileAsync = promisify(execFile);
const stackName = `server-import-verify-${process.pid}-${Date.now()}`;
const imageName = `dockge-${stackName}:test`;
const expectedContent = "server-project-import";
const projectsDir = await fsAsync.mkdtemp(path.join(os.tmpdir(), "dockge-server-projects-"));
const projectDir = path.join(projectsDir, "local-project");
const stacksDir = await fsAsync.mkdtemp(path.join(os.tmpdir(), "dockge-server-import-stacks-"));
const stackDir = path.join(stacksDir, stackName);

try {
    await fsAsync.mkdir(projectDir);
    await fsAsync.writeFile(path.join(projectDir, "Dockerfile"), "FROM alpine:3.21\nCOPY verification.txt /verification.txt\n");
    await fsAsync.writeFile(path.join(projectDir, "verification.txt"), `${expectedContent}\n`);
    await fsAsync.writeFile(path.join(projectDir, ".env"), `EXPECTED=${expectedContent}\n`);
    await fsAsync.writeFile(path.join(projectDir, "compose.yaml"), `services:
  verify:
    image: ${imageName}
    build: .
    environment:
      EXPECTED: \${EXPECTED:?Set EXPECTED in .env}
    command: ["sh", "-c", 'grep -qx "$$EXPECTED" /verification.txt && sleep 60']
`);

    const preview = await inspectServerProject(projectsDir, projectDir);
    await copyServerProject(projectsDir, stacksDir, stackName, projectDir);

    const server = { stacksDir } as DockgeServer;
    const stack = new Stack(server, stackName, preview.composeYAML, preview.composeENV);
    await stack.save(false);

    const socket = {
        id: "server-import-verification-socket",
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
        throw new Error("The server-import verification container is not running");
    }

    const { stdout: importedContent } = await execFileAsync("docker", [
        "exec",
        containerID.trim(),
        "cat",
        "/verification.txt",
    ]);
    if (importedContent.trim() !== expectedContent) {
        throw new Error("The built image does not contain the server project file");
    }

    console.log(`Server project import verified with container ${containerID.trim().slice(0, 12)}.`);
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
    await Promise.all([
        fsAsync.rm(projectsDir, {
            recursive: true,
            force: true,
        }),
        fsAsync.rm(stacksDir, {
            recursive: true,
            force: true,
        }),
    ]);
}
