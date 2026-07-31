import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
    findMissingBindMounts,
    prepareBindMountSources,
    suggestBindMountSourceType
} from "../backend/bind-mount";

async function temporaryStack(t: TestContext) {
    const stackPath = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-bind-mount-test-"));
    t.after(async () => {
        await fs.rm(stackPath, {
            recursive: true,
            force: true,
        });
    });
    return stackPath;
}

test("missing bind mount sources are grouped and suggested without guessing every suffixless path is a directory", async (t) => {
    const stackPath = await temporaryStack(t);
    const config = {
        services: {
            app: {
                volumes: [
                    { type: "bind",
                        source: path.join(stackPath, ".accounts.json"),
                        target: "/app/.accounts.json" },
                    { type: "bind",
                        source: path.join(stackPath, "Caddyfile"),
                        target: "/etc/caddy/Caddyfile" },
                    { type: "bind",
                        source: path.join(stackPath, "data"),
                        target: "/app/data" },
                ],
            },
            worker: {
                volumes: [
                    { type: "bind",
                        source: path.join(stackPath, "data"),
                        target: "/worker/data" },
                    { type: "volume",
                        source: "database",
                        target: "/var/lib/database" },
                ],
            },
        },
    };

    const missing = await findMissingBindMounts(config, stackPath);
    assert.deepEqual(missing.map(mount => ({
        displaySource: mount.displaySource,
        suggestedType: mount.suggestedType,
        uses: mount.uses,
    })), [
        {
            displaySource: "./.accounts.json",
            suggestedType: "file",
            uses: [{ service: "app",
                target: "/app/.accounts.json" }],
        },
        {
            displaySource: "./Caddyfile",
            suggestedType: "file",
            uses: [{ service: "app",
                target: "/etc/caddy/Caddyfile" }],
        },
        {
            displaySource: "./data",
            suggestedType: "directory",
            uses: [
                { service: "app",
                    target: "/app/data" },
                { service: "worker",
                    target: "/worker/data" },
            ],
        },
    ]);
});

test("existing bind sources and named volumes do not require setup", async (t) => {
    const stackPath = await temporaryStack(t);
    await fs.mkdir(path.join(stackPath, "data"));
    const config = {
        services: {
            app: {
                volumes: [
                    { type: "bind",
                        source: path.join(stackPath, "data"),
                        target: "/app/data" },
                    { type: "volume",
                        source: "cache",
                        target: "/cache" },
                ],
            },
        },
    };

    assert.deepEqual(await findMissingBindMounts(config, stackPath), []);
});

test("preparing bind sources creates the selected file and directory without overwriting", async (t) => {
    const stackPath = await temporaryStack(t);
    const fileSource = path.join(stackPath, "config", "settings.json");
    const directorySource = path.join(stackPath, "state");
    const config = {
        services: {
            app: {
                volumes: [
                    { type: "bind",
                        source: fileSource,
                        target: "/app/settings.json" },
                    { type: "bind",
                        source: directorySource,
                        target: "/app/state" },
                ],
            },
        },
    };
    const missing = await findMissingBindMounts(config, stackPath);

    await prepareBindMountSources(stackPath, missing, [
        { source: fileSource,
            type: "file",
            content: "{}\n" },
        { source: directorySource,
            type: "directory" },
    ]);

    assert.equal(await fs.readFile(fileSource, "utf-8"), "{}\n");
    assert.equal((await fs.stat(fileSource)).isFile(), true);
    assert.equal((await fs.stat(directorySource)).isDirectory(), true);
    await assert.rejects(
        prepareBindMountSources(stackPath, missing, [
            { source: fileSource,
                type: "file",
                content: "replacement" },
            { source: directorySource,
                type: "directory" },
        ]),
        /already exists/
    );
});

test("preparing bind sources rejects paths outside the stack and symlink escapes", async (t) => {
    const stackPath = await temporaryStack(t);
    const outsidePath = path.join(path.dirname(stackPath), "outside-bind-source");
    const outsideMissing = await findMissingBindMounts({
        services: {
            app: {
                volumes: [{ type: "bind",
                    source: outsidePath,
                    target: "/outside" }],
            },
        },
    }, stackPath);
    assert.equal(outsideMissing[0].canCreate, false);
    await assert.rejects(
        prepareBindMountSources(stackPath, outsideMissing, [
            { source: outsidePath,
                type: "directory" },
        ]),
        /cannot be created by Dockge/
    );

    const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-bind-mount-outside-"));
    t.after(() => fs.rm(outsideDirectory, { recursive: true,
        force: true }));
    await fs.symlink(outsideDirectory, path.join(stackPath, "linked"));
    const escapedSource = path.join(stackPath, "linked", "settings.json");
    const escapedMissing = await findMissingBindMounts({
        services: {
            app: {
                volumes: [{ type: "bind",
                    source: escapedSource,
                    target: "/settings.json" }],
            },
        },
    }, stackPath);
    await assert.rejects(
        prepareBindMountSources(stackPath, escapedMissing, [
            { source: escapedSource,
                type: "file" },
        ]),
        /resolves outside the stack directory/
    );
});

test("file suggestions use suffixes only as hints", () => {
    assert.equal(suggestBindMountSourceType("/stack/override.md", "/app/override.md"), "file");
    assert.equal(suggestBindMountSourceType("/stack/Dockerfile", "/app/Dockerfile"), "file");
    assert.equal(suggestBindMountSourceType("/stack/cache", "/app/cache"), "directory");
    assert.equal(suggestBindMountSourceType("/stack/nginx.conf.d", "/etc/nginx/conf.d"), "directory");
});
