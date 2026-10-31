import { spawn } from "node:child_process";
import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { AgentSocket } from "../../common/agent-socket";
import { assertSafeServiceName, Stack } from "../stack";
import { ContainerSource, FileSource, parseReadRequest, processOutput, StackFolderSource, StripAnsi } from "../file-explorer";
import { transfers } from "../file-transfer";

/**
 * Read-only file explorer: browse a stack's folder or a running container, view files and download
 * them (and container logs) in chunks.
 */
export class FileSocketHandler extends AgentSocketHandler {
    create(socket : DockgeSocket, server : DockgeServer, agentSocket : AgentSocket) {
        socket.on("disconnect", () => transfers.closeOwner(socket.id));

        // source: { type: "stack" } or { type: "container", service: "<service name>" }
        agentSocket.on("listFiles", async (stackName : unknown, source : unknown, dirPath : unknown, callback) => {
            try {
                checkLogin(socket);
                const files = await getSource(server, stackName, source);
                callbackResult({
                    ok: true,
                    ...await files.list(String(dirPath ?? "/")),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("readFile", async (stackName : unknown, source : unknown, filePath : unknown, request : unknown, callback) => {
            try {
                checkLogin(socket);
                const files = await getSource(server, stackName, source);
                const range = await files.read(String(filePath ?? ""), parseReadRequest(request));
                callbackResult({
                    ok: true,
                    ...range,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("openFileDownload", async (stackName : unknown, source : unknown, filePath : unknown, callback) => {
            try {
                checkLogin(socket);
                const files = await getSource(server, stackName, source);
                const { stream, name, size } = await files.openStream(String(filePath ?? ""));
                callbackResult({
                    ok: true,
                    ...transfers.open(socket.id, stream, name, size),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Container logs (`docker compose logs`) as a file; serviceName empty = the whole stack
        agentSocket.on("openLogDownload", async (stackName : unknown, serviceName : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }
                const services : string[] = [];
                if (serviceName) {
                    assertSafeServiceName(serviceName);
                    services.push(serviceName);
                }
                const stack = await Stack.getStack(server, stackName);
                const child = spawn("docker", stack.getComposeOptions("logs", "--no-color", "--timestamps", ...services), {
                    cwd: stack.path,
                });
                const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
                const name = `${stack.name}${services.length ? "-" + services[0] : ""}-${stamp}.log`;
                callbackResult({
                    ok: true,
                    ...transfers.open(socket.id, processOutput(child, new StripAnsi()), name, null),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("readTransfer", async (id : unknown, callback) => {
            try {
                checkLogin(socket);
                const { chunk, done } = await transfers.read(socket.id, id);
                callbackResult({
                    ok: true,
                    chunk,
                    done,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("closeTransfer", async (id : unknown, callback) => {
            try {
                checkLogin(socket);
                transfers.close(socket.id, id);
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}

async function getSource(server : DockgeServer, stackName : unknown, source : unknown) : Promise<FileSource> {
    if (typeof stackName !== "string") {
        throw new ValidationError("Stack name must be a string");
    }
    const input = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
    const stack = await Stack.getStack(server, stackName);
    if (input.type === "container") {
        return ContainerSource.create(stack, input.service);
    }
    if (input.type === "stack") {
        return StackFolderSource.create(stack);
    }
    throw new ValidationError("Unknown file source");
}
