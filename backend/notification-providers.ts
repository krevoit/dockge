import crypto from "node:crypto";
import {
    getNotificationProvider,
    MAX_NOTIFICATION_CHANNELS,
    NotificationChannel,
} from "../common/notification-providers";
import { ValidationError } from "./util-server";
import type { NotificationPayload, NotificationSeverity } from "./notification";

const REQUEST_TIMEOUT_MS = 10 * 1000;
const MAX_FIELD_LENGTH = 2000;

const SEVERITY_EMOJI : Record<NotificationSeverity, string> = {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "🚨",
};

const DISCORD_COLORS : Record<NotificationSeverity, number> = {
    info: 0x5cdd8b,
    success: 0x5cdd8b,
    warning: 0xf8a306,
    error: 0xdc3545,
};

/**
 * Validate a channel from the settings UI and drop unknown fields
 */
export function validateChannel(raw : unknown) : NotificationChannel {
    if (!raw || typeof raw !== "object") {
        throw new ValidationError("Invalid notification channel");
    }
    const input = raw as Record<string, unknown>;
    const provider = getNotificationProvider(String(input.type));
    if (!provider) {
        throw new ValidationError(`Unknown notification type '${input.type}'`);
    }

    const rawConfig = (input.config && typeof input.config === "object" ? input.config : {}) as Record<string, unknown>;
    const config : Record<string, string> = {};
    for (const field of provider.fields) {
        const value = String(rawConfig[field.key] ?? "").trim();
        if (value.length > MAX_FIELD_LENGTH) {
            throw new ValidationError(`${provider.name}: ${field.label} is too long`);
        }
        if (!value) {
            if (field.required) {
                throw new ValidationError(`${provider.name}: ${field.label} is required`);
            }
            continue;
        }
        if (field.type === "url") {
            let url : URL;
            try {
                url = new URL(value);
            } catch {
                throw new ValidationError(`${provider.name}: ${field.label} is not a valid URL`);
            }
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                throw new ValidationError(`${provider.name}: ${field.label} must start with http:// or https://`);
            }
        }
        config[field.key] = value;
    }

    if (provider.type === "telegram") {
        if (!/^\d+:[A-Za-z0-9_-]+$/.test(config.botToken)) {
            throw new ValidationError("Telegram: Bot Token looks invalid (expected 123456789:ABC…)");
        }
        if (!/^(-?\d+|@[A-Za-z0-9_]{4,})$/.test(config.chatId)) {
            throw new ValidationError("Telegram: Chat ID must be a number or @channelname");
        }
        if (config.messageThreadId && !/^\d+$/.test(config.messageThreadId)) {
            throw new ValidationError("Telegram: Topic ID must be a number");
        }
    }

    const id = typeof input.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(input.id) ? input.id : crypto.randomUUID();
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 60) : provider.name;

    return {
        id,
        name,
        type: provider.type,
        enabled: input.enabled !== false,
        config,
    };
}

export function validateChannels(raw : unknown) : NotificationChannel[] {
    if (raw === undefined || raw === null) {
        return [];
    }
    if (!Array.isArray(raw)) {
        throw new ValidationError("Notification channels must be a list");
    }
    if (raw.length > MAX_NOTIFICATION_CHANNELS) {
        throw new ValidationError(`At most ${MAX_NOTIFICATION_CHANNELS} notification channels are supported`);
    }
    const seen = new Set<string>();
    return raw.map((item) => {
        const channel = validateChannel(item);
        if (seen.has(channel.id)) {
            channel.id = crypto.randomUUID();
        }
        seen.add(channel.id);
        return channel;
    });
}

/**
 * Send a notification to one channel. Throws with a readable message on failure.
 */
export async function sendToChannel(channel : NotificationChannel, payload : NotificationPayload, host : string) : Promise<void> {
    const c = channel.config;
    const plain = `${payload.title}\n${payload.message}`;

    switch (channel.type) {
        case "discord":
            return postJson("Discord", c.webhookUrl, {
                username: "Dockge",
                embeds: [
                    {
                        title: truncate(payload.title, 256),
                        description: truncate(payload.message, 4000),
                        color: DISCORD_COLORS[payload.severity],
                        timestamp: new Date().toISOString(),
                        footer: { text: truncate(host, 2000) },
                    },
                ],
            });

        case "telegram": {
            const text = `${SEVERITY_EMOJI[payload.severity]} <b>${escapeHtml(payload.title)}</b>\n${escapeHtml(payload.message)}\n<i>${escapeHtml(host)}</i>`;
            return postJson("Telegram", `https://api.telegram.org/bot${c.botToken}/sendMessage`, {
                chat_id: c.chatId,
                text: truncate(text, 4000),
                parse_mode: "HTML",
                disable_web_page_preview: true,
                ...(c.messageThreadId ? { message_thread_id: Number(c.messageThreadId) } : {}),
            });
        }

        case "ntfy": {
            const priority = payload.severity === "error" || payload.severity === "warning" ? 4 : 3;
            const tags = {
                info: "information_source",
                success: "white_check_mark",
                warning: "warning",
                error: "rotating_light",
            }[payload.severity];
            // JSON publishing goes to the server root with the topic in the body
            return postJson("ntfy", c.serverUrl, {
                topic: c.topic,
                title: truncate(payload.title, 250),
                message: truncate(`${payload.message}\n${host}`, 4000),
                priority,
                tags: [ tags ],
            }, c.accessToken ? { Authorization: `Bearer ${c.accessToken}` } : {});
        }

        case "gotify": {
            const priority = payload.severity === "error" ? 8 : payload.severity === "warning" ? 6 : 4;
            return postJson("Gotify", joinUrl(c.serverUrl, "message"), {
                title: payload.title,
                message: `${payload.message}\n${host}`,
                priority,
            }, { "X-Gotify-Key": c.appToken });
        }

        case "teams": {
            const color = {
                info: "Default",
                success: "Good",
                warning: "Warning",
                error: "Attention",
            }[payload.severity];
            return postJson("Microsoft Teams", c.webhookUrl, {
                type: "message",
                attachments: [
                    {
                        contentType: "application/vnd.microsoft.card.adaptive",
                        content: {
                            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                            type: "AdaptiveCard",
                            version: "1.4",
                            body: [
                                {
                                    type: "TextBlock",
                                    text: payload.title,
                                    weight: "Bolder",
                                    size: "Medium",
                                    color,
                                    wrap: true,
                                },
                                {
                                    type: "TextBlock",
                                    // Adaptive Card markdown needs a blank line for a line break
                                    text: payload.message.replace(/\n/g, "\n\n"),
                                    wrap: true,
                                },
                                {
                                    type: "TextBlock",
                                    text: host,
                                    isSubtle: true,
                                    size: "Small",
                                    wrap: true,
                                },
                            ],
                        },
                    },
                ],
            });
        }

        case "mattermost":
            return postJson("Mattermost", c.webhookUrl, {
                username: "Dockge",
                text: truncate(`${SEVERITY_EMOJI[payload.severity]} **${payload.title}**\n${payload.message}\n_${host}_`, 16000),
                ...(c.channel ? { channel: c.channel } : {}),
            });

        case "apprise":
            return postJson("Apprise", c.url, {
                title: payload.title,
                body: `${payload.message}\n${host}`,
                type: payload.severity === "error" ? "failure" : payload.severity,
                format: "text",
                ...(c.urls ? { urls: c.urls } : {}),
            });

        case "webhook":
            return postJson("Webhook", c.url, {
                ...payload,
                host,
                timestamp: new Date().toISOString(),
                text: plain,
            }, c.authorization ? { Authorization: c.authorization } : {});

        default:
            throw new Error(`Unknown notification type '${channel.type}'`);
    }
}

/**
 * POST JSON. Retries once on network errors, 429 and 5xx; never more.
 */
async function postJson(service : string, url : string, body : object, headers : Record<string, string> = {}) : Promise<void> {
    const init = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Dockge",
            ...headers,
        },
        body: JSON.stringify(body),
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
        let res : Response;
        try {
            res = await fetch(url, {
                ...init,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (e) {
            if (attempt === 2) {
                throw new Error(`${service} request failed: ${e instanceof Error ? e.message : e}`, { cause: e });
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
        throw new Error(`${service} returned HTTP ${res.status}${await errorDetail(res)}`);
    }
}

/**
 * A short reason from the response body, e.g. Telegram's "Bad Request: chat not found"
 */
async function errorDetail(res : Response) : Promise<string> {
    try {
        const text = (await res.text()).trim();
        if (!text) {
            return "";
        }
        try {
            const json = JSON.parse(text);
            const reason = json.description ?? json.message ?? json.error ?? json.errorDescription;
            if (typeof reason === "string" && reason) {
                return `: ${truncate(reason, 200)}`;
            }
        } catch {
            // Not JSON
        }
        return `: ${truncate(text.replace(/\s+/g, " "), 200)}`;
    } catch {
        return "";
    }
}

function joinUrl(base : string, path : string) : string {
    return base.replace(/\/+$/, "") + "/" + path;
}

function escapeHtml(text : string) : string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(text : string, max : number) : string {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function sleep(ms : number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
