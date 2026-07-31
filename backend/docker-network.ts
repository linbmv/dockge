export type DockerNetworkList = () => Promise<string[]>;
export type DockerNetworkCreate = (networkName : string) => Promise<void>;

/**
 * Create an administrator-configured Docker network once. A second list after
 * a failed create handles concurrent Dockge instances racing to create it.
 */
export async function ensureDockerNetwork(
    networkName : string,
    listNetworks : DockerNetworkList,
    createNetwork : DockerNetworkCreate
) : Promise<"created" | "existing"> {
    if ((await listNetworks()).includes(networkName)) {
        return "existing";
    }

    try {
        await createNetwork(networkName);
        return "created";
    } catch (error) {
        if ((await listNetworks()).includes(networkName)) {
            return "existing";
        }
        throw error;
    }
}
