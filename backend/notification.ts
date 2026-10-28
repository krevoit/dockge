import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import os from "node:os";
import { log } from "./log";
import { Settings } from "./settings";
import { Stack } from "./stack";
import { ValidationError } from "./util-server";

export type WebhookFormat = "json" | "discord" | "slack";

export type NotificationEvent =
    "test" |
    "image.updates" |
    "container.crashed" |
    "container.oom" |
    "container.unhealthy" |
    "container.recovered";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface NotificationPayload {
    event: NotificationEvent;
    severity: NotificationSeverity;
    title: string;
    message: string;
    stack?: string;
    service?: string;
    container?: string;
    image?: string;
    exitCode?: number;
    occurrences?: number;
    updates?: ImageUpdateEntry[];
}

interface ImageUpdateEntry {
    stack: string;
    service: string;
    image: string;
}

interface DockerEvent {
    Action?: string;
    status?: string;
    id?: string;
    Actor?: {
        ID?: string;
        Attributes?: Record<string, string>;
    };
}

interface WebhookConfig {
    url: string;
    format: WebhookFormat;
}

interface ContainerInfo {
    id: string;
    name: string;
    stack?: string;
    service?: string;
    image?: string;
}

interface Throttle {
    lastSent: number;
    suppressed: number;
    summary?: (count: number, minutes: number) => NotificationPayload;
    timer?: NodeJS.Timeout;
}

const DEFAULT_COOLDOWN_MINUTES = 15;
const MAX_COOLDOWN_MINUTES = 24 * 60;

// Hard cap across all notification types, so nothing can flood the webhook
const GLOBAL_LIMIT = 30;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

// A container that dies within this long after a kill/stop event was stopped on purpose
const KILL_GRACE_MS = 2 * 60 * 1000;

// This many crashes of one container within the window is reported as a restart loop
const LOOP_WINDOW_MS = 10 * 60 * 1000;
const LOOP_THRESHOLD = 3;

const WEBHOOK_TIMEOUT_MS = 10 * 1000;
const FAILURE_LOG_INTERVAL_MS = 5 * 60 * 1000;

const DISCORD_COLORS: Record<NotificationSeverity, number> = {
    info: 0x5cdd8b,
    success: 0x5cdd8b,
    warning: 0xf8a306,
    error: 0xdc3545,
};

export function validateWebhookUrl(url : unknown) : string {
    if (typeof url !== "string" || !url.trim()) {
        throw new ValidationError("Webhook URL is required");
    }
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
    } catch {
        throw new ValidationError("Invalid webhook URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new ValidationError("Webhook URL must start with http:// or https://");
    }
    return parsed.toString();
}

export function normalizeWebhookFormat(format : unknown) : WebhookFormat {
    return format === "discord" || format === "slack" ? format : "json";
}

export function normalizeCooldownMinutes(minutes : unknown) : number {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1) {
        return DEFAULT_COOLDOWN_MINUTES;
    }
    return Math.min(value, MAX_COOLDOWN_MINUTES);
}

function truncate(text : string, max : number) : string {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export function buildWebhookBody(payload : NotificationPayload, format : WebhookFormat, host : string) : object {
    const timestamp = new Date().toISOString();

    if (format === "discord") {
        return {
            username: "Dockge",
            embeds: [
                {
                    title: truncate(payload.title, 256),
                    description: truncate(payload.message, 4000),
                    color: DISCORD_COLORS[payload.severity],
                    timestamp,
                    footer: { text: truncate(host, 2000) },
                },
            ],
        };
    }

    if (format === "slack") {
        return {
            text: truncate(`*${payload.title}*\n${payload.message}\n_${host}_`, 3900),
        };
    }

    // Generic JSON. `text` makes it readable by Slack-compatible receivers (Mattermost, Rocket.Chat, ...)
    return {
        ...payload,
        host,
        timestamp,
        text: `${payload.title}\n${payload.message}`,
    };
}

function sleep(ms : number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * POST a notification. Retries once on network errors, 429 and 5xx; never more.
 */
export async function postWebhook(config : WebhookConfig, payload : NotificationPayload, host : string) : Promise<void> {
    const body = JSON.stringify(buildWebhookBody(payload, config.format, host));

    for (let attempt = 1; attempt <= 2; attempt++) {
        let res: Response;
        try {
            res = await fetch(config.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "Dockge",
                },
                body,
                signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
            });
        } catch (e) {
            if (attempt === 2) {
                throw new Error(`Webhook request failed: ${e instanceof Error ? e.message : e}`, { cause: e });
            }
            await sleep(3000);
            continue;
        }

        if (res.ok) {
            return;
        }
        if (attempt === 1 && (res.status === 429 || res.status >= 500)) {
            await sleep(3000);
            continue;
        }
        throw new Error(`Webhook returned HTTP ${res.status}`);
    }
}

export class NotificationManager {
    protected sentTimes: number[] = [];
    protected droppedByRateLimit = 0;
    protected throttles = new Map<string, Throttle>();
    protected crashTimes = new Map<string, number[]>();
    protected unhealthySent = new Set<string>();
    protected lastFailureLog = 0;
    protected eventMonitor = new ContainerEventMonitor(this);

    /**
     * Start or stop the docker events watcher to match the current settings
     */
    async refresh() {
        const config = await this.getConfig();
        const watchEvents = !!config && (await this.isEnabled("notifyContainerCrash") || await this.isEnabled("notifyContainerUnhealthy"));
        if (watchEvents) {
            this.eventMonitor.start();
        } else {
            this.eventMonitor.stop();
        }
    }

    stop() {
        this.eventMonitor.stop();
        for (const throttle of this.throttles.values()) {
            clearTimeout(throttle.timer);
        }
        this.throttles.clear();
    }

    async sendTest(url : unknown, format : unknown) {
        await postWebhook({
            url: validateWebhookUrl(url),
            format: normalizeWebhookFormat(format),
        }, {
            event: "test",
            severity: "info",
            title: "Dockge test notification",
            message: "Webhook notifications are working.",
        }, await this.getHost());
    }

    /**
     * Notify about image updates that have not been notified yet (per stack/service and remote digest)
     */
    async notifyImageUpdates(stacks : Iterable<Stack>) {
        if (!await this.isEnabled("notifyImageUpdates") || !await this.getConfig()) {
            return;
        }

        const stored = await Settings.get("notificationNotifiedUpdates");
        const notified : Record<string, string> = stored && typeof stored === "object" ? stored : {};
        const current : Record<string, string> = {};
        const fresh : ImageUpdateEntry[] = [];

        for (const stack of stacks) {
            for (const detail of stack.updateDetails) {
                const key = `${stack.name}/${detail.service}`;
                current[key] = detail.remoteDigest;
                if (notified[key] !== detail.remoteDigest) {
                    fresh.push({
                        stack: stack.name,
                        service: detail.service,
                        image: detail.image,
                    });
                }
            }
        }

        // Forget services that were updated, so a later update for them is notified again
        await Settings.set("notificationNotifiedUpdates", current, "notificationState");

        if (fresh.length === 0) {
            return;
        }

        const lines = fresh.slice(0, 20).map(u => `• ${u.stack}/${u.service} (${u.image})`);
        if (fresh.length > 20) {
            lines.push(`…and ${fresh.length - 20} more`);
        }

        await this.deliver({
            event: "image.updates",
            severity: "info",
            title: fresh.length === 1 ? "Image update available" : `${fresh.length} image updates available`,
            message: lines.join("\n"),
            updates: fresh,
        });
    }

    async containerCrashed(info : ContainerInfo, exitCode : number, oom : boolean) {
        if (!await this.isEnabled("notifyContainerCrash")) {
            return;
        }

        const now = Date.now();
        const times = (this.crashTimes.get(info.name) || []).filter(t => now - t < LOOP_WINDOW_MS);
        times.push(now);
        this.crashTimes.set(info.name, times);
        const inLoop = times.length >= LOOP_THRESHOLD;

        const label = this.label(info);
        let title = `${label} crashed`;
        if (oom) {
            title = `${label} was killed: out of memory`;
        } else if (inLoop) {
            title = `${label} is in a restart loop`;
        }

        const payload : NotificationPayload = {
            event: oom ? "container.oom" : "container.crashed",
            severity: "error",
            title,
            message: [
                oom ? `Container ${info.name} ran out of memory and was killed (exit code ${exitCode}).` : `Container ${info.name} exited with code ${exitCode}.`,
                inLoop ? `It crashed ${times.length} times in the last ${LOOP_WINDOW_MS / 60000} minutes.` : "",
                this.details(info),
            ].filter(Boolean).join("\n"),
            ...this.fields(info),
            exitCode,
        };

        await this.notifyThrottled(`crash:${info.name}`, payload, (count, minutes) => ({
            ...payload,
            title: `${label} crashed ${count} more time${count === 1 ? "" : "s"}`,
            message: [
                `Container ${info.name} crashed ${count} more time${count === 1 ? "" : "s"} in the last ${minutes} minute${minutes === 1 ? "" : "s"} and may be stuck in a restart loop.`,
                `Last exit code: ${exitCode}.`,
                this.details(info),
            ].filter(Boolean).join("\n"),
            occurrences: count,
        }));
    }

    async containerHealth(info : ContainerInfo, status : string) {
        if (!await this.isEnabled("notifyContainerUnhealthy")) {
            return;
        }
        const label = this.label(info);

        if (status === "unhealthy") {
            const payload : NotificationPayload = {
                event: "container.unhealthy",
                severity: "warning",
                title: `${label} is unhealthy`,
                message: [ `Container ${info.name} failed its health check.`, this.details(info) ].filter(Boolean).join("\n"),
                ...this.fields(info),
            };
            const sent = await this.notifyThrottled(`health:${info.name}`, payload, (count, minutes) => ({
                ...payload,
                title: `${label} became unhealthy ${count} more time${count === 1 ? "" : "s"}`,
                message: [ `Container ${info.name} became unhealthy ${count} more time${count === 1 ? "" : "s"} in the last ${minutes} minute${minutes === 1 ? "" : "s"} (flapping health check).`, this.details(info) ].filter(Boolean).join("\n"),
                occurrences: count,
            }));
            if (sent) {
                this.unhealthySent.add(info.name);
            }
        } else if (status === "healthy" && this.unhealthySent.delete(info.name)) {
            // Only announce recovery for an unhealthy notification that was actually sent
            await this.deliver({
                event: "container.recovered",
                severity: "success",
                title: `${label} is healthy again`,
                message: [ `Container ${info.name} passed its health check again.`, this.details(info) ].filter(Boolean).join("\n"),
                ...this.fields(info),
            });
        }
    }

    containerRemoved(name : string) {
        this.unhealthySent.delete(name);
    }

    /**
     * First event for a key is sent right away. Repeats within the cooldown are counted and
     * sent as one summary when the cooldown ends, so a container in a restart loop produces
     * at most one notification per cooldown period.
     * @returns whether the notification was sent now
     */
    protected async notifyThrottled(key : string, payload : NotificationPayload, summary : (count: number, minutes: number) => NotificationPayload) : Promise<boolean> {
        const cooldownMs = await this.getCooldownMs();
        const now = Date.now();
        const throttle = this.throttles.get(key);

        if (throttle && now - throttle.lastSent < cooldownMs) {
            throttle.suppressed++;
            throttle.summary = summary;
            if (!throttle.timer) {
                throttle.timer = setTimeout(() => {
                    this.flush(key, cooldownMs).catch(e => log.error("notification", e));
                }, throttle.lastSent + cooldownMs - now);
            }
            return false;
        }

        this.pruneThrottles(now);
        this.throttles.set(key, {
            lastSent: now,
            suppressed: 0,
        });
        await this.deliver(payload);
        return true;
    }

    protected async flush(key : string, cooldownMs : number) {
        const throttle = this.throttles.get(key);
        if (!throttle) {
            return;
        }
        throttle.timer = undefined;
        if (throttle.suppressed > 0 && throttle.summary) {
            const count = throttle.suppressed;
            throttle.suppressed = 0;
            throttle.lastSent = Date.now();
            await this.deliver(throttle.summary(count, Math.round(cooldownMs / 60000)));
        }
    }

    protected pruneThrottles(now : number) {
        for (const [ key, throttle ] of this.throttles) {
            if (!throttle.timer && now - throttle.lastSent > MAX_COOLDOWN_MINUTES * 60 * 1000) {
                this.throttles.delete(key);
            }
        }
        for (const [ name, times ] of this.crashTimes) {
            if (times.every(t => now - t > LOOP_WINDOW_MS)) {
                this.crashTimes.delete(name);
            }
        }
    }

    /**
     * Send through the global rate limit. Never throws: delivery failures are logged (throttled).
     */
    protected async deliver(payload : NotificationPayload) {
        const config = await this.getConfig();
        if (!config) {
            return;
        }

        const now = Date.now();
        this.sentTimes = this.sentTimes.filter(t => now - t < GLOBAL_WINDOW_MS);
        if (this.sentTimes.length >= GLOBAL_LIMIT) {
            if (this.droppedByRateLimit === 0) {
                log.warn("notification", `More than ${GLOBAL_LIMIT} notifications in the last hour, dropping until the rate drops`);
            }
            this.droppedByRateLimit++;
            return;
        }
        this.sentTimes.push(now);

        if (this.droppedByRateLimit > 0) {
            payload = {
                ...payload,
                message: `${payload.message}\n(${this.droppedByRateLimit} other notification${this.droppedByRateLimit === 1 ? " was" : "s were"} dropped by the rate limit)`,
            };
            this.droppedByRateLimit = 0;
        }

        try {
            await postWebhook(config, payload, await this.getHost());
            log.debug("notification", `Sent ${payload.event}: ${payload.title}`);
        } catch (e) {
            if (now - this.lastFailureLog > FAILURE_LOG_INTERVAL_MS) {
                this.lastFailureLog = now;
                log.warn("notification", `Failed to send notification: ${e instanceof Error ? e.message : e}`);
            }
        }
    }

    protected async getConfig() : Promise<WebhookConfig | undefined> {
        const url = await Settings.get("notificationWebhookUrl");
        if (typeof url !== "string" || !url.trim()) {
            return undefined;
        }
        try {
            return {
                url: validateWebhookUrl(url),
                format: normalizeWebhookFormat(await Settings.get("notificationWebhookFormat")),
            };
        } catch {
            return undefined;
        }
    }

    protected async isEnabled(key : string) : Promise<boolean> {
        return await Settings.get(key) === true;
    }

    protected async getCooldownMs() : Promise<number> {
        return normalizeCooldownMinutes(await Settings.get("notificationCooldownMinutes")) * 60 * 1000;
    }

    protected async getHost() : Promise<string> {
        const primaryHostname = await Settings.get("primaryHostname");
        return typeof primaryHostname === "string" && primaryHostname.trim() ? primaryHostname.trim() : os.hostname();
    }

    protected label(info : ContainerInfo) : string {
        return info.stack && info.service ? `${info.stack}/${info.service}` : info.name;
    }

    protected details(info : ContainerInfo) : string {
        const parts = [];
        if (info.stack) {
            parts.push(`Stack: ${info.stack}`);
        }
        if (info.service) {
            parts.push(`Service: ${info.service}`);
        }
        if (info.image) {
            parts.push(`Image: ${info.image}`);
        }
        return parts.join(" · ");
    }

    protected fields(info : ContainerInfo) {
        return {
            stack: info.stack,
            service: info.service,
            container: info.name,
            image: info.image,
        };
    }
}

/**
 * Watches `docker events` for crashed, OOM-killed and unhealthy containers.
 */
class ContainerEventMonitor {
    protected process? : ChildProcessWithoutNullStreams;
    protected buffer = "";
    protected running = false;
    protected backoffMs = 1000;
    protected startedAt = 0;
    protected restartTimer? : NodeJS.Timeout;
    protected recentKills = new Map<string, number>();
    protected oomKilled = new Set<string>();

    constructor(protected manager : NotificationManager) {
    }

    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        this.backoffMs = 1000;
        this.spawn();
        log.info("notification", "Watching container events for notifications");
    }

    stop() {
        if (!this.running) {
            return;
        }
        this.running = false;
        clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
        this.process?.kill();
        this.process = undefined;
        log.info("notification", "Stopped watching container events");
    }

    protected spawn() {
        const child = spawn("docker", [
            "events",
            "--format", "{{json .}}",
            "--filter", "type=container",
            "--filter", "event=die",
            "--filter", "event=kill",
            "--filter", "event=stop",
            "--filter", "event=oom",
            "--filter", "event=destroy",
            "--filter", "event=health_status",
        ]);
        this.process = child;
        this.startedAt = Date.now();
        this.buffer = "";

        child.stdout.setEncoding("utf-8");
        child.stdout.on("data", (chunk : string) => {
            this.buffer += chunk;
            const lines = this.buffer.split("\n");
            this.buffer = lines.pop() || "";
            for (const line of lines) {
                this.handleLine(line);
            }
        });
        child.stderr.on("data", (chunk) => log.debug("notification", `docker events: ${chunk}`));
        child.on("error", (e) => log.error("notification", e));
        child.on("close", (code) => {
            if (this.process !== child) {
                return;
            }
            this.process = undefined;
            if (!this.running) {
                return;
            }
            // Back off exponentially while docker events keeps failing (e.g. daemon restarting)
            if (Date.now() - this.startedAt > 60 * 1000) {
                this.backoffMs = 1000;
            }
            log.warn("notification", `docker events exited (code ${code}), restarting in ${this.backoffMs / 1000}s`);
            this.restartTimer = setTimeout(() => {
                if (this.running) {
                    this.spawn();
                }
            }, this.backoffMs);
            this.backoffMs = Math.min(this.backoffMs * 2, 60 * 1000);
        });
    }

    protected handleLine(line : string) {
        if (!line.trim()) {
            return;
        }
        let event;
        try {
            event = JSON.parse(line);
        } catch {
            return;
        }
        this.handleEvent(event).catch(e => log.error("notification", e));
    }

    protected async handleEvent(event : DockerEvent) {
        const action = String(event.Action || event.status || "");
        const id = String(event.Actor?.ID || event.id || "");
        const attributes = event.Actor?.Attributes || {};
        if (!id) {
            return;
        }

        const info : ContainerInfo = {
            id,
            name: attributes.name || id.slice(0, 12),
            stack: attributes["com.docker.compose.project"],
            service: attributes["com.docker.compose.service"],
            image: attributes.image,
        };
        const now = Date.now();

        if (action === "kill" || action === "stop") {
            // docker stop/restart/rm -f, compose down/up and Dockge's own actions all send these before "die".
            // (A kill with a non-terminating signal, e.g. SIGHUP for a reload, can hide a crash within the grace period.)
            this.recentKills.set(id, now);
            for (const [ killedId, time ] of this.recentKills) {
                if (now - time > KILL_GRACE_MS) {
                    this.recentKills.delete(killedId);
                }
            }
            return;
        }

        if (action === "oom") {
            this.oomKilled.add(id);
            return;
        }

        if (action === "destroy") {
            this.recentKills.delete(id);
            this.oomKilled.delete(id);
            this.manager.containerRemoved(info.name);
            return;
        }

        if (action === "die") {
            const killedAt = this.recentKills.get(id);
            this.recentKills.delete(id);
            const oom = this.oomKilled.delete(id);
            const exitCode = Number(attributes.exitCode);

            if (!oom && killedAt !== undefined && now - killedAt < KILL_GRACE_MS) {
                return;
            }
            if (!oom && exitCode === 0) {
                return;
            }
            await this.manager.containerCrashed(info, Number.isFinite(exitCode) ? exitCode : -1, oom);
            return;
        }

        if (action.startsWith("health_status")) {
            const status = action.split(":")[1]?.trim() || "";
            await this.manager.containerHealth(info, status);
        }
    }
}
