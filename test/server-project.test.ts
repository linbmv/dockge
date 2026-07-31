import assert from "node:assert/strict";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { copyServerProject, inspectServerProject } from "../backend/server-project";

async function projectSandbox(t : TestContext) {
    const sandbox = await fsAsync.mkdtemp(path.join(os.tmpdir(), "dockge-server-project-test-"));
    const projectsDir = path.join(sandbox, "projects");
    const stacksDir = path.join(sandbox, "stacks");
    await Promise.all([
        fsAsync.mkdir(projectsDir),
        fsAsync.mkdir(stacksDir),
    ]);
    t.after(async () => {
        await fsAsync.rm(sandbox, {
            recursive: true,
            force: true,
        });
    });
    return {
        sandbox,
        projectsDir,
        stacksDir,
    };
}

async function createTestSymlink(target: string, linkPath: string) {
    if (process.platform === "win32") {
        return false;
    }
    try {
        await fsAsync.symlink(target, linkPath);
        return true;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (process.platform === "win32" && (code === "EPERM" || code === "EACCES")) {
            return false;
        }
        throw error;
    }
}

async function createProject(projectsDir : string, name = "Local App") {
    const projectPath = path.join(projectsDir, name);
    await fsAsync.mkdir(projectPath);
    await fsAsync.writeFile(path.join(projectPath, "docker-compose.yml"), "services:\n  app:\n    build: .\n");
    await fsAsync.writeFile(path.join(projectPath, ".env"), "VALUE=server\n");
    await fsAsync.writeFile(path.join(projectPath, "Dockerfile"), "FROM scratch\n");
    await fsAsync.writeFile(path.join(projectPath, "run.sh"), "#!/bin/sh\n", { mode: 0o755 });
    const hasSymlink = await createTestSymlink("run.sh", path.join(projectPath, "run-link"));
    return {
        projectPath,
        hasSymlink,
    };
}

test("previews and atomically copies an allowed server project", async (t) => {
    const { projectsDir, stacksDir } = await projectSandbox(t);
    const project = await createProject(projectsDir);
    const projectPath = project.projectPath;

    const preview = await inspectServerProject(projectsDir, projectPath);
    assert.equal(preview.projectPath, await fsAsync.realpath(projectPath));
    assert.equal(preview.composeFileName, "docker-compose.yml");
    assert.match(preview.composeYAML, /build: \./);
    assert.equal(preview.composeENV, "VALUE=server\n");
    assert.equal(preview.suggestedStackName, "local-app");

    const sourceMode = (await fsAsync.stat(path.join(projectPath, "run.sh"))).mode & 0o777;
    await copyServerProject(projectsDir, stacksDir, "local-app", projectPath);
    const copiedPath = path.join(stacksDir, "local-app");
    assert.equal(await fsAsync.readFile(path.join(copiedPath, "Dockerfile"), "utf-8"), "FROM scratch\n");
    assert.equal((await fsAsync.stat(path.join(copiedPath, "run.sh"))).mode & 0o777, sourceMode);
    if (project.hasSymlink) {
        assert.equal(await fsAsync.readlink(path.join(copiedPath, "run-link")), "run.sh");
    }
    assert.deepEqual(
        (await fsAsync.readdir(stacksDir)).filter(name => name.startsWith(".dockge-import-")),
        []
    );
});

test("rejects paths outside the configured server projects directory", async (t) => {
    const { sandbox, projectsDir } = await projectSandbox(t);
    const outsidePath = (await createProject(sandbox, "outside")).projectPath;
    const linkedOutsidePath = path.join(projectsDir, "linked-outside");
    const hasOutsideSymlink = await createTestSymlink(outsidePath, linkedOutsidePath);

    await assert.rejects(inspectServerProject(projectsDir, outsidePath), /inside the configured/);
    if (hasOutsideSymlink) {
        await assert.rejects(inspectServerProject(projectsDir, linkedOutsidePath), /inside the configured/);
    }
    await assert.rejects(inspectServerProject(projectsDir, projectsDir), /inside the configured/);
    await assert.rejects(inspectServerProject(projectsDir, "relative/project"), /must be absolute/);
});

test("requires a root Compose file and refuses an existing Stack", async (t) => {
    const { projectsDir, stacksDir } = await projectSandbox(t);
    const emptyProject = path.join(projectsDir, "empty");
    await fsAsync.mkdir(emptyProject);
    await assert.rejects(inspectServerProject(projectsDir, emptyProject), /No Compose file/);

    const projectPath = (await createProject(projectsDir, "ready")).projectPath;
    await fsAsync.mkdir(path.join(stacksDir, "existing"));
    await assert.rejects(
        copyServerProject(projectsDir, stacksDir, "existing", projectPath),
        /already exists/
    );
    assert.deepEqual(
        (await fsAsync.readdir(stacksDir)).filter(name => name.startsWith(".dockge-import-")),
        []
    );
});
