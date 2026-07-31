import { acceptedComposeFileNames } from "./util-common";

export const STACK_UPLOAD_CHUNK_MAX_BYTES = 512 * 1024;
export const STACK_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
export const STACK_UPLOAD_MAX_FILES = 5000;

export function removeDirectoryUploadRoot(relativePath : string) : string {
    const separatorIndex = relativePath.indexOf("/");
    if (separatorIndex === -1) {
        return relativePath;
    }
    return relativePath.slice(separatorIndex + 1);
}

export function findProjectComposeFile(relativePaths : Iterable<string>) : string | undefined {
    const paths = new Set(relativePaths);
    return acceptedComposeFileNames.find(fileName => paths.has(fileName));
}

export function stackNameFromProjectRoot(rootName : string) : string {
    return rootName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
