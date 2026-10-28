import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import childProcessAsync from "promisify-child-process";
import { log } from "./log";

// Every refresh cycle starts by moving the cursor home: older CLIs print "ESC[2J ESC[H",
// newer ones "ESC[H" and end lines/cycles with "ESC[K"/"ESC[J"
const CYCLE_START = "\x1b[H";
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const IDLE_STOP_MS = 30 * 1000;
const FIRST_SNAPSHOT_TIMEOUT_MS = 4 * 1000;

export interface DockerHostInfo {
    ncpu: number;
    memTotal: number;
}

/**
 * Keeps one streaming `docker stats` process running while anyone is looking at stats,
 * instead of spawning `docker stats --no-stream` (which samples for ~2s) on every request.
 * The process is stopped again after 30 seconds without requests.
 */
export class DockerStatsMonitor {
    protected process?: ChildProcessWithoutNullStreams;
    protected snapshot = new Map<string, object>();
    protected cycle = new Map<string, object>();
    protected buffer = "";
    protected lastRequest = 0;
    protected idleTimer?: NodeJS.Timeout;
    protected snapshotWaiters: (() => void)[] = [];
    protected hostInfo?: DockerHostInfo;

    async getStats(): Promise<Map<string, object>> {
        this.lastRequest = Date.now();
        if (!this.process) {
            this.start();
        }
        if (this.snapshot.size === 0) {
            await this.waitForSnapshot();
        }
        return this.snapshot;
    }

    async getHostInfo(): Promise<DockerHostInfo | undefined> {
        if (this.hostInfo) {
            return this.hostInfo;
        }
        try {
            const res = await childProcessAsync.spawn("docker", [ "info", "--format", "{{.NCPU}} {{.MemTotal}}" ], {
                encoding: "utf-8",
                timeout: 10 * 1000,
            });
            const [ ncpu, memTotal ] = (res.stdout?.toString() || "").trim().split(" ").map(Number);
            if (ncpu > 0 && memTotal > 0) {
                this.hostInfo = {
                    ncpu,
                    memTotal,
                };
            }
        } catch (e) {
            log.debug("docker-stats", `docker info failed: ${e}`);
        }
        return this.hostInfo;
    }

    stop() {
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = undefined;
        }
        this.process?.kill();
        this.process = undefined;
        this.snapshot = new Map();
        this.cycle = new Map();
        this.buffer = "";
    }

    protected start() {
        const child = spawn("docker", [ "stats", "--format", "{{json .}}" ]);
        this.process = child;

        child.stdout.setEncoding("utf-8");
        child.stdout.on("data", (chunk: string) => this.onData(chunk));
        child.stderr.on("data", (chunk) => log.debug("docker-stats", chunk.toString()));
        child.on("error", (e) => log.error("docker-stats", e));
        child.on("close", () => {
            if (this.process === child) {
                this.process = undefined;
                this.snapshot = new Map();
            }
            this.resolveWaiters();
        });

        this.idleTimer = setInterval(() => {
            if (Date.now() - this.lastRequest > IDLE_STOP_MS) {
                log.debug("docker-stats", "No stats requests for a while, stopping docker stats");
                this.stop();
            }
        }, 10 * 1000);
    }

    protected onData(chunk: string) {
        this.buffer += chunk;

        // A completed cycle becomes the new snapshot
        let index;
        while ((index = this.buffer.indexOf(CYCLE_START)) >= 0) {
            this.parseLines(this.buffer.slice(0, index));
            this.buffer = this.buffer.slice(index + CYCLE_START.length);
            if (this.cycle.size > 0) {
                this.snapshot = this.cycle;
                this.cycle = new Map();
                this.resolveWaiters();
            }
        }

        const lastNewline = this.buffer.lastIndexOf("\n");
        if (lastNewline >= 0) {
            this.parseLines(this.buffer.slice(0, lastNewline));
            this.buffer = this.buffer.slice(lastNewline + 1);
        }
    }

    protected parseLines(text: string) {
        for (const rawLine of text.split("\n")) {
            const line = rawLine.replace(ANSI_ESCAPE, "");
            if (!line.trim()) {
                continue;
            }
            try {
                const obj = JSON.parse(line);
                if (obj && typeof obj.Name === "string") {
                    this.cycle.set(obj.Name, obj);
                }
            } catch {
                // Ignore partial or non-JSON lines
            }
        }
    }

    protected waitForSnapshot(): Promise<void> {
        return new Promise((resolve) => {
            const timer = setTimeout(done, FIRST_SNAPSHOT_TIMEOUT_MS);
            const waiters = this.snapshotWaiters;
            function done() {
                clearTimeout(timer);
                const i = waiters.indexOf(done);
                if (i >= 0) {
                    waiters.splice(i, 1);
                }
                resolve();
            }
            waiters.push(done);
        });
    }

    protected resolveWaiters() {
        for (const waiter of [ ...this.snapshotWaiters ]) {
            waiter();
        }
    }
}
