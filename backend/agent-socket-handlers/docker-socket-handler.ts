import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { DeleteOptions, Stack } from "../stack";
import { AgentSocket } from "../../common/agent-socket";
import childProcessAsync from "promisify-child-process";
import fs from "fs/promises";
import os from "os";
import path from "path";

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

        agentSocket.on("containerFileList", async (stackName : unknown, serviceName : unknown, containerPath : unknown, callback) => {
            try {
                checkLogin(socket);
                const { stackName: checkedStackName, serviceName: checkedServiceName, containerPath: checkedPath } = this.checkContainerFileArgs(stackName, serviceName, containerPath);
                const stack = await Stack.getStack(server, checkedStackName);
                const stdout = await this.execInService(stack, checkedServiceName, `
dir="$1"
[ -d "$dir" ] || { echo "Not a directory" >&2; exit 2; }
for p in "$dir"/..?* "$dir"/.[!.]* "$dir"/*; do
    [ -e "$p" ] || continue
    name=\${p##*/}
    type="file"
    [ -d "$p" ] && type="directory"
    [ -L "$p" ] && type="symlink"
    size=$(stat -c "%s" "$p" 2>/dev/null || wc -c < "$p" 2>/dev/null || echo 0)
    mode=$(stat -c "%a" "$p" 2>/dev/null || echo "")
    modified=$(stat -c "%y" "$p" 2>/dev/null || echo "")
    printf "%s\\t%s\\t%s\\t%s\\t%s\\n" "$type" "$name" "$size" "$mode" "$modified"
done
`, [ checkedPath ]);

                callbackResult({
                    ok: true,
                    path: checkedPath,
                    entries: this.parseContainerFileList(stdout),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("containerFileRead", async (stackName : unknown, serviceName : unknown, containerPath : unknown, callback) => {
            let tmpFile : string | undefined;
            try {
                checkLogin(socket);
                const { stackName: checkedStackName, serviceName: checkedServiceName, containerPath: checkedPath } = this.checkContainerFileArgs(stackName, serviceName, containerPath);
                const stack = await Stack.getStack(server, checkedStackName);
                const containerId = await this.getServiceContainerId(stack, checkedServiceName);
                tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "dockge-file-")), path.posix.basename(checkedPath) || "file");
                await childProcessAsync.spawn("docker", [ "cp", `${containerId}:${checkedPath}`, tmpFile ], {
                    encoding: "utf-8",
                });
                const buffer = await fs.readFile(tmpFile);
                if (buffer.length > 1024 * 1024) {
                    throw new ValidationError("File is too large to edit in the browser");
                }
                callbackResult({
                    ok: true,
                    content: buffer.toString("utf-8"),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            } finally {
                if (tmpFile) {
                    await fs.rm(path.dirname(tmpFile), {
                        recursive: true,
                        force: true,
                    });
                }
            }
        });

        agentSocket.on("containerFileWrite", async (stackName : unknown, serviceName : unknown, containerPath : unknown, content : unknown, callback) => {
            let tmpFile : string | undefined;
            try {
                checkLogin(socket);
                const { stackName: checkedStackName, serviceName: checkedServiceName, containerPath: checkedPath } = this.checkContainerFileArgs(stackName, serviceName, containerPath);
                if (typeof(content) !== "string") {
                    throw new ValidationError("File content must be a string");
                }
                const stack = await Stack.getStack(server, checkedStackName);
                const containerId = await this.getServiceContainerId(stack, checkedServiceName);
                tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "dockge-file-")), path.posix.basename(checkedPath) || "file");
                await fs.writeFile(tmpFile, content, "utf-8");
                await childProcessAsync.spawn("docker", [ "cp", tmpFile, `${containerId}:${checkedPath}` ], {
                    encoding: "utf-8",
                });
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            } finally {
                if (tmpFile) {
                    await fs.rm(path.dirname(tmpFile), {
                        recursive: true,
                        force: true,
                    });
                }
            }
        });

        agentSocket.on("containerFileDownload", async (stackName : unknown, serviceName : unknown, containerPath : unknown, callback) => {
            let tmpFile : string | undefined;
            try {
                checkLogin(socket);
                const { stackName: checkedStackName, serviceName: checkedServiceName, containerPath: checkedPath } = this.checkContainerFileArgs(stackName, serviceName, containerPath);
                const stack = await Stack.getStack(server, checkedStackName);
                const containerId = await this.getServiceContainerId(stack, checkedServiceName);
                tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "dockge-file-")), path.posix.basename(checkedPath) || "download");
                await childProcessAsync.spawn("docker", [ "cp", `${containerId}:${checkedPath}`, tmpFile ], {
                    encoding: "utf-8",
                });
                const buffer = await fs.readFile(tmpFile);
                if (buffer.length > 25 * 1024 * 1024) {
                    throw new ValidationError("File is too large to download through the browser");
                }
                callbackResult({
                    ok: true,
                    filename: path.posix.basename(checkedPath) || "download",
                    contentBase64: buffer.toString("base64"),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            } finally {
                if (tmpFile) {
                    await fs.rm(path.dirname(tmpFile), {
                        recursive: true,
                        force: true,
                    });
                }
            }
        });

        agentSocket.on("containerFileUpload", async (stackName : unknown, serviceName : unknown, containerPath : unknown, filename : unknown, contentBase64 : unknown, callback) => {
            let tmpFile : string | undefined;
            try {
                checkLogin(socket);
                const { stackName: checkedStackName, serviceName: checkedServiceName, containerPath: checkedPath } = this.checkContainerFileArgs(stackName, serviceName, containerPath);
                if (typeof(filename) !== "string" || filename.trim() === "") {
                    throw new ValidationError("Filename is required");
                }
                if (typeof(contentBase64) !== "string") {
                    throw new ValidationError("Uploaded file content must be base64");
                }
                const safeFilename = path.posix.basename(filename);
                if (!safeFilename || safeFilename === "." || safeFilename === "..") {
                    throw new ValidationError("Invalid filename");
                }
                const buffer = Buffer.from(contentBase64, "base64");
                if (buffer.length > 25 * 1024 * 1024) {
                    throw new ValidationError("File is too large to upload through the browser");
                }
                const stack = await Stack.getStack(server, checkedStackName);
                const containerId = await this.getServiceContainerId(stack, checkedServiceName);
                tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "dockge-upload-")), safeFilename);
                await fs.writeFile(tmpFile, buffer);
                const targetPath = checkedPath.endsWith("/") ? `${checkedPath}${safeFilename}` : `${checkedPath}/${safeFilename}`;
                await childProcessAsync.spawn("docker", [ "cp", tmpFile, `${containerId}:${targetPath}` ], {
                    encoding: "utf-8",
                });
                callbackResult({
                    ok: true,
                    msg: "Uploaded",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            } finally {
                if (tmpFile) {
                    await fs.rm(path.dirname(tmpFile), {
                        recursive: true,
                        force: true,
                    });
                }
            }
        });

        agentSocket.on("containerFileChmod", async (stackName : unknown, serviceName : unknown, containerPath : unknown, mode : unknown, callback) => {
            try {
                checkLogin(socket);
                const { stackName: checkedStackName, serviceName: checkedServiceName, containerPath: checkedPath } = this.checkContainerFileArgs(stackName, serviceName, containerPath);
                if (typeof(mode) !== "string" || !mode.match(/^[0-7]{3,4}$/)) {
                    throw new ValidationError("Mode must be an octal value such as 644 or 0755");
                }
                const stack = await Stack.getStack(server, checkedStackName);
                await this.execInService(stack, checkedServiceName, "chmod \"$1\" \"$2\"", [ mode, checkedPath ]);
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
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
                const allContainers = await this.getDockerContainers();
                const dockgeContainers = allContainers.filter(container => container.isDockge);
                const containers = allContainers.filter(container => !container.isDockge);
                const [ networks, volumes, images ] = await Promise.all([
                    this.getDockerNetworks(dockgeContainers),
                    this.getDockerVolumes(dockgeContainers, containers),
                    this.getDockerImages(dockgeContainers, containers),
                ]);
                callbackResult({
                    ok: true,
                    resources: {
                        containers,
                        networks,
                        volumes,
                        images,
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
                    image: [ "image", "rm", name ],
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
                const optionRows = data.options instanceof Array ? data.options : [];
                for (const optionRow of optionRows) {
                    if (!optionRow || typeof(optionRow) !== "object") {
                        continue;
                    }
                    const option = optionRow as Record<string, unknown>;
                    const key = String(option.key || "").trim();
                    const value = String(option.value || "").trim();
                    if (key && value) {
                        args.push("--opt", `${key}=${value}`);
                    }
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

        agentSocket.on("connectDockerNetwork", async (networkName : unknown, containerName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(networkName) !== "string" || typeof(containerName) !== "string") {
                    throw new ValidationError("Network and container names must be strings");
                }

                await this.checkNotDockgeContainer(containerName);
                await childProcessAsync.spawn("docker", [ "network", "connect", networkName, containerName ], {
                    encoding: "utf-8",
                });

                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("disconnectDockerNetwork", async (networkName : unknown, containerName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(networkName) !== "string" || typeof(containerName) !== "string") {
                    throw new ValidationError("Network and container names must be strings");
                }

                await this.checkNotDockgeContainer(containerName);
                await childProcessAsync.spawn("docker", [ "network", "disconnect", networkName, containerName ], {
                    encoding: "utf-8",
                });

                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    checkContainerFileArgs(stackName : unknown, serviceName : unknown, containerPath : unknown) {
        if (typeof(stackName) !== "string" || typeof(serviceName) !== "string") {
            throw new ValidationError("Stack name and service name must be strings");
        }
        if (typeof(containerPath) !== "string" || !containerPath.startsWith("/")) {
            throw new ValidationError("Container path must be an absolute path");
        }
        return {
            stackName,
            serviceName,
            containerPath,
        };
    }

    async execInService(stack : Stack, serviceName : string, script : string, args : string[] = []) : Promise<string> {
        const res = await childProcessAsync.spawn("docker", stack.getComposeOptions("exec", "-T", serviceName, "sh", "-c", script, "sh", ...args), {
            cwd: stack.path,
            encoding: "utf-8",
        });
        return res.stdout?.toString() || "";
    }

    async getServiceContainerId(stack : Stack, serviceName : string) : Promise<string> {
        const res = await childProcessAsync.spawn("docker", stack.getComposeOptions("ps", "-q", serviceName), {
            cwd: stack.path,
            encoding: "utf-8",
        });
        const containerId = res.stdout?.toString().trim().split("\n")[0] || "";
        if (!containerId) {
            throw new ValidationError("Container is not running");
        }
        return containerId;
    }

    parseContainerFileList(stdout : string) {
        return stdout
            .split("\n")
            .filter(line => line.trim() !== "")
            .map((line) => {
                const [ type, name, size, mode, modified ] = line.split("\t");
                return {
                    type,
                    name,
                    size: Number(size) || 0,
                    mode,
                    modified,
                };
            })
            .sort((a, b) => {
                if (a.type === "directory" && b.type !== "directory") {
                    return -1;
                }
                if (a.type !== "directory" && b.type === "directory") {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });
    }

    isDockgeLabels(labels : unknown) : boolean {
        if (!labels || typeof(labels) !== "object") {
            return false;
        }

        const labelMap = labels as Record<string, unknown>;
        return labelMap["com.docker.compose.project"] === "dockge" ||
            labelMap["com.docker.compose.service"] === "dockge" ||
            labelMap["com.docker.compose.project.working_dir"]?.toString().includes("/dockge") === true;
    }

    isDockgeImageName(imageName : unknown) : boolean {
        const name = String(imageName || "").toLowerCase();
        return name === "dockge" ||
            name.endsWith("/dockge") ||
            name.includes("/dockge:") ||
            name.includes("/dockge@") ||
            name.includes("cmcooper1980/dockge") ||
            name.includes("louislam/dockge");
    }

    isDockgeContainer(container : Record<string, unknown>, labels : unknown) : boolean {
        const name = String(container.Names || "").replace(/^\//, "").toLowerCase();
        return name === "dockge" ||
            this.isDockgeLabels(labels) ||
            this.isDockgeImageName(container.Image);
    }

    async checkNotDockgeContainer(containerName : string) {
        const inspectRes = await childProcessAsync.spawn("docker", [ "inspect", containerName ], {
            encoding: "utf-8",
        });
        const inspect = JSON.parse(inspectRes.stdout?.toString() || "[]")[0] || {};
        const config = inspect.Config as DockerInspectObject | undefined;
        const container = {
            Names: inspect.Name || containerName,
            Image: config?.Image,
        };
        if (this.isDockgeContainer(container, config?.Labels)) {
            throw new ValidationError("Dockge resources cannot be modified here");
        }
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

    async getDockerContainers() : Promise<Array<Record<string, unknown>>> {
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
                imageId: inspect.Image,
                image: container.Image,
                status: container.Status,
                state: container.State,
                ports: container.Ports,
                createdAt: container.CreatedAt,
                labels: config?.Labels || {},
                networks,
                mounts,
                isolated: hostConfig?.NetworkMode === "none" || networks.length === 0,
                isDockge: this.isDockgeContainer(container, config?.Labels),
            };
        }));
    }

    async getDockerNetworks(dockgeContainers : Array<Record<string, unknown>>) : Promise<Array<Record<string, unknown>>> {
        const res = await childProcessAsync.spawn("docker", [ "network", "ls", "--format", "json" ], {
            encoding: "utf-8",
        });
        const networks = this.parseDockerJSONLines(res.stdout);
        const dockgeContainerIds = dockgeContainers.map(container => String(container.id || ""));

        const result = await Promise.all(networks.map(async (network) => {
            const networkName = String(network.Name || network.ID || "");
            let inspect : DockerInspectObject = {};
            try {
                const inspectRes = await childProcessAsync.spawn("docker", [ "network", "inspect", networkName ], {
                    encoding: "utf-8",
                });
                inspect = JSON.parse(inspectRes.stdout?.toString() || "[]")[0] || {};
            } catch (e) {
            }

            const connectedContainers = Object.entries((inspect.Containers as Record<string, DockerInspectObject> | undefined) || {})
                .map(([ id, container ]) => ({
                    id,
                    name: String(container.Name || id),
                    ipv4: container.IPv4Address || "",
                    ipv6: container.IPv6Address || "",
                    isDockge: dockgeContainerIds.some(dockgeId => dockgeId.startsWith(id) || id.startsWith(dockgeId)),
                }));
            const visibleConnectedContainers = connectedContainers.filter(container => !container.isDockge);
            const hasDockgeContainer = connectedContainers.some(container => container.isDockge);
            const isBuiltInNetwork = [ "bridge", "host", "none" ].includes(networkName);
            const hidden = !isBuiltInNetwork && (
                this.isDockgeLabels(inspect.Labels) ||
                networkName === "dockge_default" ||
                (hasDockgeContainer && connectedContainers.length === 1)
            );

            return {
                id: network.ID,
                name: networkName,
                driver: network.Driver,
                scope: network.Scope,
                internal: !!inspect.Internal,
                attachable: !!inspect.Attachable,
                ingress: !!inspect.Ingress,
                isolated: !!inspect.Internal,
                unused: visibleConnectedContainers.length === 0,
                options: inspect.Options || {},
                labels: inspect.Labels || {},
                ipam: (inspect.IPAM as DockerInspectObject | undefined)?.Config || [],
                containers: visibleConnectedContainers,
                hidden,
            };
        }));

        return result.filter(network => !network.hidden);
    }

    async getDockerVolumes(dockgeContainers : Array<Record<string, unknown>>, containers : Array<Record<string, unknown>>) : Promise<Array<Record<string, unknown>>> {
        const res = await childProcessAsync.spawn("docker", [ "volume", "ls", "--format", "json" ], {
            encoding: "utf-8",
        });
        const volumes = this.parseDockerJSONLines(res.stdout);
        const visibleMounts = containers.flatMap(container => container.mounts as Array<Record<string, unknown>> || []);
        const dockgeMounts = dockgeContainers.flatMap(container => container.mounts as Array<Record<string, unknown>> || []);

        const result = await Promise.all(volumes.map(async (volume) => {
            const volumeName = String(volume.Name || "");
            let inspect : DockerInspectObject = {};
            try {
                const inspectRes = await childProcessAsync.spawn("docker", [ "volume", "inspect", volumeName ], {
                    encoding: "utf-8",
                });
                inspect = JSON.parse(inspectRes.stdout?.toString() || "[]")[0] || {};
            } catch (e) {
            }

            const usedBy = visibleMounts
                .filter(mount => mount.type === "volume" && mount.name === volumeName)
                .map(mount => mount.destination);
            const hidden = this.isDockgeLabels(inspect.Labels) ||
                dockgeMounts.some(mount => mount.type === "volume" && mount.name === volumeName);

            return {
                name: volumeName,
                driver: volume.Driver,
                scope: volume.Scope,
                mountpoint: inspect.Mountpoint || "",
                createdAt: inspect.CreatedAt || "",
                labels: inspect.Labels || {},
                options: inspect.Options || {},
                usedBy,
                unused: usedBy.length === 0,
                hidden,
            };
        }));

        return result.filter(volume => !volume.hidden);
    }

    async getDockerImages(dockgeContainers : Array<Record<string, unknown>>, containers : Array<Record<string, unknown>>) : Promise<Array<Record<string, unknown>>> {
        const res = await childProcessAsync.spawn("docker", [ "image", "ls", "--format", "json" ], {
            encoding: "utf-8",
        });
        const images = this.parseDockerJSONLines(res.stdout);
        const visibleImageIds = containers.map(container => String(container.imageId || container.image || ""));
        const dockgeImageIds = dockgeContainers.map(container => String(container.imageId || container.image || ""));

        const result = await Promise.all(images.map(async (image) => {
            const repository = String(image.Repository || "");
            const tag = String(image.Tag || "");
            const imageId = String(image.ID || "");
            const imageName = repository === "<none>" ? imageId : `${repository}:${tag}`;
            let inspect : DockerInspectObject = {};
            try {
                const inspectRes = await childProcessAsync.spawn("docker", [ "image", "inspect", imageName ], {
                    encoding: "utf-8",
                });
                inspect = JSON.parse(inspectRes.stdout?.toString() || "[]")[0] || {};
            } catch (e) {
            }

            const fullImageId = String(inspect.Id || imageId);
            const usedBy = visibleImageIds.filter(usedImageId => fullImageId.includes(usedImageId) || usedImageId.includes(fullImageId) || usedImageId === imageName);
            const hidden = this.isDockgeLabels((inspect.Config as DockerInspectObject | undefined)?.Labels) ||
                this.isDockgeImageName(repository) ||
                dockgeImageIds.some(dockgeImageId => fullImageId.includes(dockgeImageId) || dockgeImageId.includes(fullImageId));

            return {
                id: imageId,
                name: imageName,
                repository,
                tag,
                size: image.Size,
                createdAt: image.CreatedAt,
                usedBy,
                unused: usedBy.length === 0,
                dangling: repository === "<none>" || tag === "<none>",
                hidden,
            };
        }));

        return result.filter(image => !image.hidden);
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
