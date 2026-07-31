import crypto from "node:crypto";
import { promises as fsAsync } from "node:fs";
import path from "node:path";
import { ValidationError, fileExists } from "./util-server";
import {
    STACK_UPLOAD_CHUNK_MAX_BYTES,
    STACK_UPLOAD_MAX_BYTES,
    STACK_UPLOAD_MAX_FILES
} from "../common/stack-file-upload";

interface StackUploadSession {
    socketID: string;
    stackName: string;
    targetPath: string;
    temporaryPath: string;
    bytesWritten: number;
    fileSizes: Map<string, number>;
}

function validateStackName(stackName : string) {
    if (!stackName.match(/^[a-z0-9_-]+$/)) {
        throw new ValidationError("Stack name can only contain [a-z][0-9] _ - only");
    }
}

export function normalizeStackUploadPath(relativePath : unknown) : string {
    if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.length > 4096) {
        throw new ValidationError("Project file path is invalid");
    }
    if (relativePath.includes("\0") || relativePath.includes("\\") || path.posix.isAbsolute(relativePath)) {
        throw new ValidationError("Project file path must be relative");
    }

    const segments = relativePath.split("/");
    if (segments.some(segment => segment.length === 0 || segment === "." || segment === "..")) {
        throw new ValidationError("Project file path must not contain empty, '.' or '..' segments");
    }

    return segments.join("/");
}

function uploadChunkToBuffer(chunk : unknown) : Buffer {
    let buffer : Buffer;
    if (Buffer.isBuffer(chunk)) {
        buffer = chunk;
    } else if (chunk instanceof Uint8Array) {
        buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    } else if (chunk instanceof ArrayBuffer) {
        buffer = Buffer.from(chunk);
    } else {
        throw new ValidationError("Project file chunk must be binary data");
    }

    if (buffer.byteLength > STACK_UPLOAD_CHUNK_MAX_BYTES) {
        throw new ValidationError("Project file chunk is too large");
    }
    return buffer;
}

export class StackFileUploadManager {
    private sessions : Map<string, StackUploadSession> = new Map();

    async begin(stacksDir : string, socketID : string, stackName : string) : Promise<string> {
        validateStackName(stackName);
        if (Array.from(this.sessions.values()).some(session => session.socketID === socketID)) {
            throw new ValidationError("Another project upload is already running");
        }
        const targetPath = path.join(stacksDir, stackName);
        if (await fileExists(targetPath)) {
            throw new ValidationError("Stack name already exists");
        }

        const temporaryPath = await fsAsync.mkdtemp(path.join(stacksDir, `.dockge-upload-${stackName}-`));
        const uploadID = crypto.randomUUID();
        this.sessions.set(uploadID, {
            socketID,
            stackName,
            targetPath,
            temporaryPath,
            bytesWritten: 0,
            fileSizes: new Map(),
        });
        return uploadID;
    }

    async writeChunk(socketID : string, uploadID : unknown, relativePath : unknown, offset : unknown, chunk : unknown) {
        const session = this.getSession(socketID, uploadID);
        const normalizedPath = normalizeStackUploadPath(relativePath);
        if (!Number.isSafeInteger(offset) || Number(offset) < 0) {
            throw new ValidationError("Project file chunk offset is invalid");
        }

        const numericOffset = Number(offset);
        const buffer = uploadChunkToBuffer(chunk);
        const hasFile = session.fileSizes.has(normalizedPath);
        const currentSize = session.fileSizes.get(normalizedPath) ?? 0;
        if (numericOffset !== currentSize) {
            throw new ValidationError("Project file chunks arrived out of order");
        }
        if (!hasFile && session.fileSizes.size >= STACK_UPLOAD_MAX_FILES) {
            throw new ValidationError(`Project folder exceeds the ${STACK_UPLOAD_MAX_FILES} file limit`);
        }
        if (session.bytesWritten + buffer.byteLength > STACK_UPLOAD_MAX_BYTES) {
            throw new ValidationError("Project folder exceeds the 100 MiB size limit");
        }

        const filePath = path.join(session.temporaryPath, ...normalizedPath.split("/"));
        await fsAsync.mkdir(path.dirname(filePath), { recursive: true });
        if (!hasFile) {
            await fsAsync.writeFile(filePath, buffer, {
                flag: "wx",
                mode: 0o644,
            });
        } else if (buffer.byteLength > 0) {
            await fsAsync.appendFile(filePath, buffer);
        }

        session.fileSizes.set(normalizedPath, currentSize + buffer.byteLength);
        session.bytesWritten += buffer.byteLength;
    }

    async finish(socketID : string, uploadID : unknown) : Promise<string> {
        const session = this.getSession(socketID, uploadID);
        if (session.fileSizes.size === 0) {
            throw new ValidationError("Project folder contains no files");
        }
        if (await fileExists(session.targetPath)) {
            throw new ValidationError("Stack name already exists");
        }

        await fsAsync.rename(session.temporaryPath, session.targetPath);
        this.sessions.delete(String(uploadID));
        return session.stackName;
    }

    async cancel(socketID : string, uploadID : unknown) {
        const session = this.getSession(socketID, uploadID);
        this.sessions.delete(String(uploadID));
        await fsAsync.rm(session.temporaryPath, {
            recursive: true,
            force: true,
        });
    }

    async cancelForSocket(socketID : string) {
        const matchingSessions = Array.from(this.sessions.entries())
            .filter(([ , session ]) => session.socketID === socketID);
        await Promise.allSettled(matchingSessions.map(async ([ uploadID, session ]) => {
            this.sessions.delete(uploadID);
            await fsAsync.rm(session.temporaryPath, {
                recursive: true,
                force: true,
            });
        }));
    }

    private getSession(socketID : string, uploadID : unknown) : StackUploadSession {
        if (typeof uploadID !== "string") {
            throw new ValidationError("Project upload ID is invalid");
        }
        const session = this.sessions.get(uploadID);
        if (!session || session.socketID !== socketID) {
            throw new ValidationError("Project upload session was not found");
        }
        return session;
    }
}

export const stackFileUploadManager = new StackFileUploadManager();
