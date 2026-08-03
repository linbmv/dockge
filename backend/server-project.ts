import crypto from "node:crypto";
import { promises as fsAsync } from "node:fs";
import path from "node:path";
import { acceptedComposeFileNames } from "../common/util-common";
import { stackNameFromProjectRoot } from "../common/stack-file-upload";
import { fileExists, ValidationError } from "./util-server";

const MAX_COMPOSE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ENV_FILE_BYTES = 1024 * 1024;

export interface ServerProjectPreview {
    projectPath: string;
    composeFileName: string;
    composeYAML: string;
    composeENV: string;
    suggestedStackName: string;
}

function isPathInside(rootPath : string, candidatePath : string, allowRoot = false) : boolean {
    const relativePath = path.relative(rootPath, candidatePath);
    if (relativePath === "") {
        return allowRoot;
    }
    return !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath);
}

async function realPathOrValidationError(candidatePath : string, message : string) : Promise<string> {
    try {
        return await fsAsync.realpath(candidatePath);
    } catch (error) {
        throw new ValidationError(message);
    }
}

async function readProjectFile(projectPath : string, fileName : string, maxBytes : number) : Promise<string> {
    const filePath = path.join(projectPath, fileName);
    const realFilePath = await realPathOrValidationError(filePath, `${fileName} could not be read`);
    if (!isPathInside(projectPath, realFilePath)) {
        throw new ValidationError(`${fileName} must stay inside the project directory`);
    }

    const fileStat = await fsAsync.stat(realFilePath);
    if (!fileStat.isFile()) {
        throw new ValidationError(`${fileName} must be a regular file`);
    }
    if (fileStat.size > maxBytes) {
        throw new ValidationError(`${fileName} is too large`);
    }
    return fsAsync.readFile(realFilePath, "utf-8");
}

export async function inspectServerProject(projectsDir : string, requestedPath : string) : Promise<ServerProjectPreview> {
    if (!projectsDir) {
        throw new ValidationError("Server project import is not configured");
    }
    if (!requestedPath || !path.isAbsolute(requestedPath)) {
        throw new ValidationError("Server project path must be absolute");
    }

    const projectsRoot = await realPathOrValidationError(
        projectsDir,
        "The configured server projects directory is unavailable"
    );
    const projectPath = await realPathOrValidationError(
        requestedPath,
        "Server project directory was not found"
    );
    if (!isPathInside(projectsRoot, projectPath)) {
        throw new ValidationError("Server project path must be inside the configured projects directory");
    }

    const projectStat = await fsAsync.stat(projectPath);
    if (!projectStat.isDirectory()) {
        throw new ValidationError("Server project path must be a directory");
    }

    let composeFileName : string | undefined;
    for (const candidate of acceptedComposeFileNames) {
        const candidatePath = path.join(projectPath, candidate);
        if (await fileExists(candidatePath)) {
            composeFileName = candidate;
            break;
        }
    }
    if (!composeFileName) {
        throw new ValidationError("No Compose file was found in the server project root");
    }

    const composeYAML = await readProjectFile(projectPath, composeFileName, MAX_COMPOSE_FILE_BYTES);
    const composeENV = await fileExists(path.join(projectPath, ".env"))
        ? await readProjectFile(projectPath, ".env", MAX_ENV_FILE_BYTES)
        : "";

    return {
        projectPath,
        composeFileName,
        composeYAML,
        composeENV,
        suggestedStackName: stackNameFromProjectRoot(path.basename(projectPath)),
    };
}

export async function copyServerProject(
    projectsDir : string,
    stacksDir : string,
    stackName : string,
    requestedPath : string
) : Promise<ServerProjectPreview> {
    if (!stackName.match(/^[a-zA-Z0-9_-]+$/)) {
        throw new ValidationError("Stack name can only contain [a-z][A-Z][0-9] _ - only");
    }

    const preview = await inspectServerProject(projectsDir, requestedPath);
    const resolvedStacksDir = path.resolve(stacksDir);
    if (isPathInside(preview.projectPath, resolvedStacksDir, true)) {
        throw new ValidationError("The Stacks directory must not be inside the imported project");
    }

    const targetPath = path.join(resolvedStacksDir, stackName);
    if (await fileExists(targetPath)) {
        throw new ValidationError("Stack name already exists");
    }

    const temporaryPath = path.join(
        resolvedStacksDir,
        `.dockge-import-${stackName}-${crypto.randomUUID()}`
    );
    try {
        await fsAsync.cp(preview.projectPath, temporaryPath, {
            recursive: true,
            force: false,
            errorOnExist: true,
            preserveTimestamps: true,
            verbatimSymlinks: true,
        });
        if (await fileExists(targetPath)) {
            throw new ValidationError("Stack name already exists");
        }
        await fsAsync.rename(temporaryPath, targetPath);
        return preview;
    } catch (error) {
        await fsAsync.rm(temporaryPath, {
            recursive: true,
            force: true,
        });
        throw error;
    }
}
