import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { DeleteOptions, Stack } from "../stack";
import { AgentSocket } from "../../common/agent-socket";
import childProcessAsync from "promisify-child-process";

type DockerInspectObject = Record<string, unknown>;

export class DockerSocketHandler extends AgentSocketHandler {
    create(socket : DockgeSocket, server : DockgeServer, agentSocket : AgentSocket) {
        // Do not call super.create()

        agentSocket.on("deployStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, composeOverrideYAML : unknown, isAdd : unknown, callback) => {
            try {
                checkLogin(socket);
                const stack = await this.saveStack(server, name, composeYAML, composeENV, composeOverrideYAML, isAdd);
                await stack.deploy(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deployed",
                    msgi18n: true,
                }, callback);
                stack.joinCombinedTerminal(socket);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("saveStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, composeOverrideYAML : unknown, isAdd : unknown, callback) => {
            try {
                checkLogin(socket);
                await this.saveStack(server, name, composeYAML, composeENV, composeOverrideYAML, isAdd);
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteStack", async (name : unknown, deleteOptions: unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof(name) !== "string") {
                    throw new ValidationError("Name must be a string");
                }
                const stack = await Stack.getStack(server, name);

                try {
                    await stack.delete(socket, deleteOptions as DeleteOptions);
                } catch (e) {
                    server.sendStackList();
                    throw e;
                }

                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("forceDeleteStack", async (name : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof(name) !== "string") {
                    throw new ValidationError("Name must be a string");
                }
                const stack = await Stack.getStack(server, name);
                await stack.forceDelete(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);

                if (stack.isManagedByDockge) {
                    stack.joinCombinedTerminal(socket);
                }

                callbackResult({
                    ok: true,
                    stack: await stack.toJSON(socket.endpoint),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // requestStackList
        agentSocket.on("requestStackList", async (callback) => {
            try {
                checkLogin(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // startStack
        agentSocket.on("startStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.start(socket);
                callbackResult({
                    ok: true,
                    msg: "Started",
                    msgi18n: true,
                }, callback);
                server.sendStackList();

                stack.joinCombinedTerminal(socket);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        // stopStack
        agentSocket.on("stopStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.stop(socket);
                callbackResult({
                    ok: true,
                    msg: "Stopped",
                    msgi18n: true,
                }, callback);
                server.sendStackList();

                stack.leaveCombinedTerminal(socket);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // restartStack
        agentSocket.on("restartStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.restart(socket);
                callbackResult({
                    ok: true,
                    msg: "Restarted",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // updateStack
        agentSocket.on("updateStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.update(socket);
                callbackResult({
                    ok: true,
                    msg: `Updated ${stackName}`,
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // down stack
        agentSocket.on("downStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.down(socket);
                callbackResult({
                    ok: true,
                    msg: "Downed",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Services status
        agentSocket.on("serviceStatusList", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName, true);
                const serviceStatusList = Object.fromEntries(await stack.getServiceStatusList());
                callbackResult({
                    ok: true,
                    serviceStatusList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Docker stats
        agentSocket.on("dockerStats", async (callback) => {
            try {
                checkLogin(socket);

                const dockerStats = Object.fromEntries(await server.getDockerStats());
                callbackResult({
                    ok: true,
                    dockerStats,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Start a service
        agentSocket.on("startService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof (stackName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Stack name and service name must be strings");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.startService(socket, serviceName);
                stack.joinCombinedTerminal(socket); // Ensure the combined terminal is joined
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " started"
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Stop a service
        agentSocket.on("stopService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof (stackName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Stack name and service name must be strings");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.stopService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " stopped"
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("restartService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof stackName !== "string" || typeof serviceName !== "string") {
                    throw new Error("Invalid stackName or serviceName");
                }

                const stack = await Stack.getStack(server, stackName, true);
                await stack.restartService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " restarted"
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // getExternalNetworkList
        agentSocket.on("getDockerNetworkList", async (callback) => {
            try {
                checkLogin(socket);
                const dockerNetworkList = await server.getDockerNetworkList();
                callbackResult({
                    ok: true,
                    dockerNetworkList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("dockerResources", async (callback) => {
            try {
                checkLogin(socket);
                const [ containers, networks, volumes ] = await Promise.all([
                    this.getDockerContainers(),
                    this.getDockerNetworks(),
                    this.getDockerVolumes(),
                ]);
                callbackResult({
                    ok: true,
                    resources: {
                        containers,
                        networks,
                        volumes,
                    },
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteDockerResource", async (resourceType : unknown, name : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(resourceType) !== "string" || typeof(name) !== "string") {
                    throw new ValidationError("Resource type and name must be strings");
                }

                const commands : Record<string, string[]> = {
                    container: [ "rm", "-f", name ],
                    network: [ "network", "rm", name ],
                    volume: [ "volume", "rm", name ],
                };
                const args = commands[resourceType];
                if (!args) {
                    throw new ValidationError("Unsupported Docker resource type");
                }

                await childProcessAsync.spawn("docker", args, {
                    encoding: "utf-8",
                });

                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("createDockerNetwork", async (options : unknown, callback) => {
            try {
                checkLogin(socket);

                if (!options || typeof(options) !== "object") {
                    throw new ValidationError("Network options must be an object");
                }

                const data = options as Record<string, unknown>;
                const name = String(data.name || "").trim();
                const driver = String(data.driver || "bridge").trim();
                if (!name) {
                    throw new ValidationError("Network name is required");
                }

                const args = [ "network", "create", "--driver", driver ];
                if (data.internal === true) {
                    args.push("--internal");
                }
                if (data.attachable === true) {
                    args.push("--attachable");
                }
                if (data.subnet) {
                    args.push("--subnet", String(data.subnet));
                }
                if (data.gateway) {
                    args.push("--gateway", String(data.gateway));
                }
                if (data.parent) {
                    args.push("--opt", `parent=${data.parent}`);
                }
                args.push(name);

                await childProcessAsync.spawn("docker", args, {
                    encoding: "utf-8",
                });

                callbackResult({
                    ok: true,
                    msg: "Created",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    parseDockerJSONLines(stdout : unknown) : Array<Record<string, unknown>> {
        if (!stdout) {
            return [];
        }
        return stdout.toString()
            .split("\n")
            .filter(line => line.trim() !== "")
            .map(line => JSON.parse(line));
    }

    async getDockerContainers() : Promise<Array<object>> {
        const res = await childProcessAsync.spawn("docker", [ "ps", "-a", "--format", "json" ], {
            encoding: "utf-8",
        });
        const containers = this.parseDockerJSONLines(res.stdout);

        return Promise.all(containers.map(async (container) => {
            const containerName = String(container.Names || container.ID || "");
            let inspect : DockerInspectObject = {};
            try {
                const inspectRes = await childProcessAsync.spawn("docker", [ "inspect", containerName ], {
                    encoding: "utf-8",
                });
                inspect = JSON.parse(inspectRes.stdout?.toString() || "[]")[0] || {};
            } catch (e) {
            }

            const networkSettings = inspect.NetworkSettings as DockerInspectObject | undefined;
            const hostConfig = inspect.HostConfig as DockerInspectObject | undefined;
            const config = inspect.Config as DockerInspectObject | undefined;
            const networks = Object.keys((networkSettings?.Networks as object | undefined) || {});
            const mounts = ((inspect.Mounts as DockerInspectObject[] | undefined) || []).map((mount) => ({
                type: mount.Type,
                name: mount.Name || mount.Source,
                destination: mount.Destination,
            }));

            return {
                id: container.ID,
                name: containerName,
                image: container.Image,
                status: container.Status,
                state: container.State,
                ports: container.Ports,
                createdAt: container.CreatedAt,
                labels: config?.Labels || {},
                networks,
                mounts,
                isolated: hostConfig?.NetworkMode === "none" || networks.length === 0,
            };
        }));
    }

    async getDockerNetworks() : Promise<Array<object>> {
        const res = await childProcessAsync.spawn("docker", [ "network", "ls", "--format", "json" ], {
            encoding: "utf-8",
        });
        const networks = this.parseDockerJSONLines(res.stdout);

        return Promise.all(networks.map(async (network) => {
            const networkName = String(network.Name || network.ID || "");
            let inspect : DockerInspectObject = {};
            try {
                const inspectRes = await childProcessAsync.spawn("docker", [ "network", "inspect", networkName ], {
                    encoding: "utf-8",
                });
                inspect = JSON.parse(inspectRes.stdout?.toString() || "[]")[0] || {};
            } catch (e) {
            }

            return {
                id: network.ID,
                name: networkName,
                driver: network.Driver,
                scope: network.Scope,
                internal: !!inspect.Internal,
                attachable: !!inspect.Attachable,
                ingress: !!inspect.Ingress,
                isolated: !!inspect.Internal,
                options: inspect.Options || {},
                labels: inspect.Labels || {},
                ipam: (inspect.IPAM as DockerInspectObject | undefined)?.Config || [],
                containers: Object.keys((inspect.Containers as object | undefined) || {}),
            };
        }));
    }

    async getDockerVolumes() : Promise<Array<object>> {
        const res = await childProcessAsync.spawn("docker", [ "volume", "ls", "--format", "json" ], {
            encoding: "utf-8",
        });
        const volumes = this.parseDockerJSONLines(res.stdout);

        return Promise.all(volumes.map(async (volume) => {
            const volumeName = String(volume.Name || "");
            let inspect : DockerInspectObject = {};
            try {
                const inspectRes = await childProcessAsync.spawn("docker", [ "volume", "inspect", volumeName ], {
                    encoding: "utf-8",
                });
                inspect = JSON.parse(inspectRes.stdout?.toString() || "[]")[0] || {};
            } catch (e) {
            }

            return {
                name: volumeName,
                driver: volume.Driver,
                scope: volume.Scope,
                mountpoint: inspect.Mountpoint || "",
                createdAt: inspect.CreatedAt || "",
                labels: inspect.Labels || {},
                options: inspect.Options || {},
            };
        }));
    }

    async saveStack(server : DockgeServer, name : unknown, composeYAML : unknown, composeENV : unknown, composeOverrideYAML : unknown, isAdd : unknown) : Promise<Stack> {
        // Check types
        if (typeof(name) !== "string") {
            throw new ValidationError("Name must be a string");
        }
        if (typeof(composeYAML) !== "string") {
            throw new ValidationError("Compose YAML must be a string");
        }
        if (typeof(composeENV) !== "string") {
            throw new ValidationError("Compose ENV must be a string");
        }
        if (typeof(composeOverrideYAML) !== "string") {
            throw new ValidationError("Compose Override YAML must be a string");
        }
        if (typeof(isAdd) !== "boolean") {
            throw new ValidationError("isAdd must be a boolean");
        }

        const stack = new Stack(server, name, composeYAML, composeENV, composeOverrideYAML, false);
        await stack.save(isAdd);
        return stack;
    }

}
