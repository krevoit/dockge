import { spawn } from "node:child_process";
import fs, { promises as fsAsync } from "node:fs";
import path from "node:path";
import { PassThrough, Readable, Transform, TransformCallback } from "node:stream";
import { assertSafeServiceName, Stack } from "./stack";
import { ValidationError } from "./util-server";

/**
 * Read-only file access for the file explorer: a stack's folder on disk, or the filesystem of a
 * running container (through `docker exec`, as root, so log folders owned by other users are readable).
 */

export const MAX_ENTRIES = 5000;
export const MAX_READ_BYTES = 1024 * 1024;
const EXEC_TIMEOUT_MS = 30 * 1000;

export type FileEntryType = "file" | "dir" | "link" | "other";
// What a symbolic link points to; "outside" = outside the stack folder, null = broken
export type LinkTarget = "file" | "dir" | "other" | "outside" | null;

export interface FileEntry {
    name: string;
    type: FileEntryType;
    size: number | null;
    mtime: number | null;
    target?: LinkTarget;
}

export interface DirectoryListing {
    path: string;
    entries: FileEntry[];
    truncated: boolean;
}

export interface FileRange {
    data: Buffer;
    start: number;
    end: number;
    size: number;
}

export interface FileStream {
    stream: Readable;
    name: string;
    size: number | null;
}

/**
 * Which part of a file to read:
 * start = from the beginning, end = the last `bytes`, before = the `bytes` before `offset`,
 * offset = from `offset` (used to follow a growing log)
 */
export interface ReadRequest {
    from: "start" | "end" | "before" | "offset";
    bytes: number;
    offset: number;
}

interface ByteRange {
    start: number;
    length: number;
}

interface ResolvedPath {
    display: string;
    real: string;
}

interface ResolvedFile {
    real: string;
    size: number;
}

interface StatInfo {
    size: number;
    mtime: number;
}

interface ServiceInstance {
    name: string;
    status: string;
}

export interface FileSource {
    list(dir : string) : Promise<DirectoryListing>;
    read(file : string, request : ReadRequest) : Promise<FileRange>;
    openStream(file : string) : Promise<FileStream>;
}

export function parseReadRequest(raw : unknown) : ReadRequest {
    const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const from = [ "start", "end", "before", "offset" ].includes(String(input.from)) ? input.from as ReadRequest["from"] : "end";
    const bytes = Math.min(MAX_READ_BYTES, Math.max(1, Math.floor(Number(input.bytes) || MAX_READ_BYTES)));
    const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
    return {
        from,
        bytes,
        offset,
    };
}

/**
 * The byte range a request covers in a file of `size` bytes
 */
function rangeFor(request : ReadRequest, size : number) : ByteRange {
    let start = 0;
    let end = size;
    if (request.from === "start") {
        end = Math.min(size, request.bytes);
    } else if (request.from === "end") {
        start = Math.max(0, size - request.bytes);
    } else if (request.from === "before") {
        end = Math.min(size, request.offset);
        start = Math.max(0, end - request.bytes);
    } else {
        start = Math.min(size, request.offset);
        end = Math.min(size, start + request.bytes);
    }
    return {
        start,
        length: Math.max(0, end - start),
    };
}

function sortEntries(entries : FileEntry[]) : FileEntry[] {
    const isDir = (e : FileEntry) => e.type === "dir" || (e.type === "link" && e.target === "dir");
    return entries.sort((a, b) => {
        if (isDir(a) !== isDir(b)) {
            return isDir(a) ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: "base",
        });
    });
}

function checkPathInput(value : unknown) : string {
    if (typeof value !== "string" || value.length > 4096 || value.includes("\0")) {
        throw new ValidationError("Invalid path");
    }
    // Always absolute, without "." / ".." segments
    return path.posix.normalize("/" + value);
}

/**
 * The stack's folder on disk (compose.yaml, .env and relative bind mounts like ./data or ./logs)
 */
export class StackFolderSource implements FileSource {
    protected constructor(protected root : string) {
    }

    static async create(stack : Stack) : Promise<StackFolderSource> {
        if (!stack.isManagedByDockge) {
            throw new ValidationError("This stack is not in the stacks folder, so it has no folder to browse");
        }
        return new StackFolderSource(await fsAsync.realpath(stack.path));
    }

    protected contains(realPath : string) : boolean {
        return realPath === this.root || realPath.startsWith(this.root + path.sep);
    }

    /**
     * Resolve a path relative to the stack folder; symbolic links may not lead outside it
     */
    protected async resolve(input : unknown) : Promise<ResolvedPath> {
        const display = checkPathInput(input);
        let real : string;
        try {
            real = await fsAsync.realpath(path.join(this.root, display));
        } catch {
            throw new ValidationError("File or folder not found");
        }
        if (!this.contains(real)) {
            throw new ValidationError("This path points outside the stack folder");
        }
        return {
            display,
            real,
        };
    }

    async list(dir : string) : Promise<DirectoryListing> {
        const { display, real } = await this.resolve(dir);
        if (!(await fsAsync.stat(real)).isDirectory()) {
            throw new ValidationError("Not a folder");
        }

        const dirents = await fsAsync.readdir(real, { withFileTypes: true });
        const truncated = dirents.length > MAX_ENTRIES;
        const entries = await Promise.all(dirents.slice(0, MAX_ENTRIES).map(async (dirent) : Promise<FileEntry> => {
            const full = path.join(real, dirent.name);
            try {
                const lstat = await fsAsync.lstat(full);
                if (lstat.isSymbolicLink()) {
                    let target : LinkTarget = null;
                    let size : number | null = null;
                    try {
                        const targetPath = await fsAsync.realpath(full);
                        if (this.contains(targetPath)) {
                            const stat = await fsAsync.stat(targetPath);
                            target = stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other";
                            size = stat.isFile() ? stat.size : null;
                        } else {
                            target = "outside";
                        }
                    } catch {
                        // Broken link
                    }
                    return {
                        name: dirent.name,
                        type: "link",
                        size,
                        mtime: lstat.mtimeMs,
                        target,
                    };
                }
                return {
                    name: dirent.name,
                    type: lstat.isDirectory() ? "dir" : lstat.isFile() ? "file" : "other",
                    size: lstat.isFile() ? lstat.size : null,
                    mtime: lstat.mtimeMs,
                };
            } catch {
                return {
                    name: dirent.name,
                    type: "other",
                    size: null,
                    mtime: null,
                };
            }
        }));

        return {
            path: display,
            entries: sortEntries(entries),
            truncated,
        };
    }

    protected async resolveFile(file : unknown) : Promise<ResolvedFile> {
        const { real } = await this.resolve(file);
        const stat = await fsAsync.stat(real);
        if (!stat.isFile()) {
            throw new ValidationError("Not a file");
        }
        return {
            real,
            size: stat.size,
        };
    }

    async read(file : string, request : ReadRequest) : Promise<FileRange> {
        const { real } = await this.resolveFile(file);
        const handle = await fsAsync.open(real, "r");
        try {
            // Size from the open handle, so the range matches what is read
            const size = (await handle.stat()).size;
            const { start, length } = rangeFor(request, size);
            const data = Buffer.alloc(length);
            const { bytesRead } = length > 0 ? await handle.read(data, 0, length, start) : { bytesRead: 0 };
            return {
                data: data.subarray(0, bytesRead),
                start,
                end: start + bytesRead,
                size,
            };
        } finally {
            await handle.close();
        }
    }

    async openStream(file : string) : Promise<FileStream> {
        const { real, size } = await this.resolveFile(file);
        return {
            stream: fs.createReadStream(real),
            name: path.basename(real),
            size,
        };
    }
}

// Lists a folder: "<type>/<name>" lines (names can't contain "/"), then "//", then "<size>/<mtime>/<name>"
// lines from stat (optional: missing on some minimal images). Uses only POSIX sh and test builtins.
const LIST_SCRIPT = `
cd -- "$1" 2>/dev/null || exit 3
n=0
for f in .* *; do
  case "$f" in .|..) continue;; esac
  [ -e "$f" ] || [ -L "$f" ] || continue
  n=$((n + 1)); [ "$n" -gt ${MAX_ENTRIES} ] && { echo "!truncated"; break; }
  t=o
  if [ -L "$f" ]; then if [ -d "$f" ]; then t=ld; elif [ -f "$f" ]; then t=lf; else t=lo; fi
  elif [ -d "$f" ]; then t=d
  elif [ -f "$f" ]; then t=f
  fi
  printf '%s/%s\\n' "$t" "$f"
done
echo //
stat -L -c '%s/%Y/%n' -- .* * 2>/dev/null | head -n ${MAX_ENTRIES + 2}
exit 0
`;

// Prints "<size> <start> <length>" and then the bytes. dd seeks to a block, so reading near the end
// of a large log doesn't read the whole file (busybox tail -c +N does).
const READ_SCRIPT = `
[ -f "$1" ] || exit 4
[ -r "$1" ] || exit 5
s=$(stat -L -c %s -- "$1" 2>/dev/null) || s=$(wc -c < "$1")
s=$((s + 0)); n=$3; o=$4
case "$2" in
  start) st=0 ;;
  end) st=$((s - n)) ;;
  before) [ "$o" -gt "$s" ] && o=$s; st=$((o - n)); [ "$st" -lt 0 ] && st=0; n=$((o - st)) ;;
  *) st=$o; [ "$st" -gt "$s" ] && st=$s ;;
esac
[ "$st" -lt 0 ] && st=0
[ $((st + n)) -gt "$s" ] && n=$((s - st))
echo "$s $st $n"
[ "$n" -gt 0 ] || exit 0
if [ "$st" -eq 0 ]; then
  head -c "$n" -- "$1"
else
  bs=65536
  dd if="$1" bs=$bs skip=$((st / bs)) count=$(((st % bs + n + bs - 1) / bs)) 2>/dev/null | tail -c +$((st % bs + 1)) | head -c "$n"
fi
`;

const SIZE_SCRIPT = `
[ -f "$1" ] || exit 4
[ -r "$1" ] || exit 5
stat -L -c %s -- "$1" 2>/dev/null || wc -c < "$1"
`;

interface ExecResult {
    code : number | null;
    stdout : Buffer;
    stderr : string;
}

/**
 * Files inside a running container
 */
export class ContainerSource implements FileSource {
    protected constructor(protected container : string) {
    }

    static async create(stack : Stack, service : unknown) : Promise<ContainerSource> {
        assertSafeServiceName(service);
        const statusList = await stack.getServiceStatusList();
        const instances = (statusList.get(service) || []) as ServiceInstance[];
        const running = instances.find(i => ![ "exited", "dead", "created", "paused", "restarting", "removing" ].includes(i.status));
        if (!running) {
            throw new ValidationError(`The ${service} container isn't running. Start it to browse its files, or download its logs instead.`);
        }
        return new ContainerSource(running.name);
    }

    protected exec(script : string, args : string[], maxBytes : number) : Promise<ExecResult> {
        return new Promise((resolve, reject) => {
            const child = spawn("docker", [ "exec", "-u", "0", "--", this.container, "sh", "-c", script, "sh", ...args ]);
            const stdout : Buffer[] = [];
            let stdoutBytes = 0;
            let stderr = "";
            const timer = setTimeout(() => child.kill(), EXEC_TIMEOUT_MS);

            child.stdout.on("data", (chunk : Buffer) => {
                stdoutBytes += chunk.length;
                if (stdoutBytes > maxBytes) {
                    child.kill();
                    return;
                }
                stdout.push(chunk);
            });
            child.stderr.on("data", (chunk : Buffer) => {
                stderr = (stderr + chunk.toString()).slice(-2000);
            });
            child.on("error", (e) => {
                clearTimeout(timer);
                reject(e);
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                if (stdoutBytes > maxBytes) {
                    reject(new ValidationError("Too much output from the container"));
                    return;
                }
                resolve({
                    code,
                    stdout: Buffer.concat(stdout),
                    stderr,
                });
            });
        });
    }

    protected failure(result : ExecResult) : ValidationError {
        const stderr = result.stderr.trim();
        if (result.code === 3) {
            return new ValidationError("Folder not found or not accessible");
        }
        if (result.code === 4) {
            return new ValidationError("Not a file");
        }
        if (result.code === 5) {
            return new ValidationError("The file isn't readable");
        }
        if (/is not running|No such container/i.test(stderr)) {
            return new ValidationError("The container isn't running");
        }
        if (result.code === 126 || result.code === 127 || /executable file not found/i.test(stderr)) {
            return new ValidationError("This container has no shell (sh), so its files can't be browsed. Use the stack folder or download its logs instead.");
        }
        return new ValidationError(stderr.split("\n").pop() || `docker exec failed (exit code ${result.code})`);
    }

    async list(dir : string) : Promise<DirectoryListing> {
        const display = checkPathInput(dir);
        const result = await this.exec(LIST_SCRIPT, [ display ], 8 * 1024 * 1024);
        if (result.code !== 0) {
            throw this.failure(result);
        }

        const text = result.stdout.toString("utf-8");
        const separator = text.indexOf("\n//\n");
        const typesPart = separator >= 0 ? text.slice(0, separator) : text;
        const statsPart = separator >= 0 ? text.slice(separator + 4) : "";

        const stats = new Map<string, StatInfo>();
        for (const line of statsPart.split("\n")) {
            const first = line.indexOf("/");
            const second = line.indexOf("/", first + 1);
            if (first > 0 && second > first) {
                stats.set(line.slice(second + 1), {
                    size: Number(line.slice(0, first)),
                    mtime: Number(line.slice(first + 1, second)) * 1000,
                });
            }
        }

        let truncated = false;
        const entries : FileEntry[] = [];
        for (const line of typesPart.split("\n")) {
            if (line === "!truncated") {
                truncated = true;
                continue;
            }
            const slash = line.indexOf("/");
            if (slash <= 0) {
                continue;
            }
            const kind = line.slice(0, slash);
            const name = line.slice(slash + 1);
            const stat = stats.get(name);
            const isLink = kind.startsWith("l");
            const target : LinkTarget = kind === "ld" ? "dir" : kind === "lf" ? "file" : kind === "lo" ? "other" : null;
            const type : FileEntryType = isLink ? "link" : kind === "d" ? "dir" : kind === "f" ? "file" : "other";
            entries.push({
                name,
                type,
                size: (type === "file" || target === "file") && stat ? stat.size : null,
                mtime: stat ? stat.mtime : null,
                ...(isLink ? { target } : {}),
            });
        }

        return {
            path: display,
            entries: sortEntries(entries),
            truncated,
        };
    }

    async read(file : string, request : ReadRequest) : Promise<FileRange> {
        const display = checkPathInput(file);
        const result = await this.exec(READ_SCRIPT, [ display, request.from, String(request.bytes), String(request.offset) ], request.bytes + 1024);
        if (result.code !== 0) {
            throw this.failure(result);
        }
        const newline = result.stdout.indexOf(0x0a);
        const [ size, start ] = result.stdout.subarray(0, newline).toString().trim().split(" ").map(Number);
        if (newline < 0 || !Number.isFinite(size) || !Number.isFinite(start)) {
            throw new ValidationError("Unexpected output from the container");
        }
        const data = result.stdout.subarray(newline + 1);
        return {
            data,
            start,
            end: start + data.length,
            size,
        };
    }

    async openStream(file : string) : Promise<FileStream> {
        const display = checkPathInput(file);
        const result = await this.exec(SIZE_SCRIPT, [ display ], 1024);
        if (result.code !== 0) {
            throw this.failure(result);
        }
        const size = Number(result.stdout.toString().trim());
        const child = spawn("docker", [ "exec", "-u", "0", "--", this.container, "cat", "--", display ]);
        return {
            stream: processOutput(child),
            name: path.posix.basename(display),
            size: Number.isFinite(size) ? size : null,
        };
    }
}

/**
 * A process's stdout as a stream that fails if the process exits with an error.
 * Destroying the stream kills the process.
 */
export function processOutput(child : ReturnType<typeof spawn>, transform? : Transform) : Readable {
    const output = new PassThrough();
    let stderr = "";
    child.stderr?.on("data", (chunk : Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-2000);
    });
    const source = transform ? child.stdout!.pipe(transform) : child.stdout!;
    source.pipe(output, { end: false });
    child.on("error", (e) => output.destroy(e));
    child.on("close", (code) => {
        if (code === 0) {
            source.once("end", () => output.end());
            if (source.readableEnded) {
                output.end();
            }
        } else if (!output.destroyed) {
            output.destroy(new Error(stderr.trim().split("\n").pop() || `Process exited with code ${code}`));
        }
    });
    output.on("close", () => {
        if (child.exitCode === null) {
            child.kill();
        }
    });
    return output;
}

/**
 * Removes ANSI escape codes line by line (docker compose logs adds them even with --no-color)
 */
export class StripAnsi extends Transform {
    protected pending = "";

    _transform(chunk : Buffer, _encoding : BufferEncoding, callback : TransformCallback) {
        const text = this.pending + chunk.toString("utf-8");
        const lastNewline = text.lastIndexOf("\n");
        if (lastNewline < 0) {
            this.pending = text;
            callback();
            return;
        }
        this.pending = text.slice(lastNewline + 1);
        callback(null, StripAnsi.strip(text.slice(0, lastNewline + 1)));
    }

    _flush(callback : TransformCallback) {
        callback(null, StripAnsi.strip(this.pending));
    }

    static strip(text : string) : string {
        return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
    }
}
