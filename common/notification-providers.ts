/*
 * Notification channel types, shared by the settings UI (form fields) and the backend (validation)
 */

export type NotificationFieldType = "text" | "url" | "password";

export interface NotificationField {
    key: string;
    label: string;
    type: NotificationFieldType;
    required?: boolean;
    placeholder?: string;
    default?: string;
    help?: string;
}

export interface NotificationProvider {
    type: string;
    name: string;
    fields: NotificationField[];
}

export interface NotificationChannel {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    config: Record<string, string>;
}

export const MAX_NOTIFICATION_CHANNELS = 20;

export const NOTIFICATION_PROVIDERS : NotificationProvider[] = [
    {
        type: "discord",
        name: "Discord",
        fields: [
            {
                key: "webhookUrl",
                label: "Webhook URL",
                type: "url",
                required: true,
                placeholder: "https://discord.com/api/webhooks/…",
                help: "Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL",
            },
        ],
    },
    {
        type: "telegram",
        name: "Telegram",
        fields: [
            {
                key: "botToken",
                label: "Bot Token",
                type: "password",
                required: true,
                placeholder: "123456789:AA…",
                help: "Create a bot with @BotFather",
            },
            {
                key: "chatId",
                label: "Chat ID",
                type: "text",
                required: true,
                placeholder: "-1001234567890 or @channelname",
                help: "Add the bot to the chat first. For a group, the ID starts with -100",
            },
            {
                key: "messageThreadId",
                label: "Topic ID (optional)",
                type: "text",
                placeholder: "Only for groups with topics",
            },
        ],
    },
    {
        type: "ntfy",
        name: "ntfy",
        fields: [
            {
                key: "serverUrl",
                label: "Server URL",
                type: "url",
                required: true,
                default: "https://ntfy.sh",
            },
            {
                key: "topic",
                label: "Topic",
                type: "text",
                required: true,
                placeholder: "dockge-alerts",
            },
            {
                key: "accessToken",
                label: "Access Token (optional)",
                type: "password",
                placeholder: "tk_…",
                help: "Needed for protected topics",
            },
        ],
    },
    {
        type: "gotify",
        name: "Gotify",
        fields: [
            {
                key: "serverUrl",
                label: "Server URL",
                type: "url",
                required: true,
                placeholder: "https://gotify.example.com",
            },
            {
                key: "appToken",
                label: "Application Token",
                type: "password",
                required: true,
            },
        ],
    },
    {
        type: "teams",
        name: "Microsoft Teams",
        fields: [
            {
                key: "webhookUrl",
                label: "Workflow Webhook URL",
                type: "url",
                required: true,
                placeholder: "https://…powerplatform.com/…/workflows/…",
                help: "In the channel: Workflows → \"Send webhook alerts to a channel\" → copy the URL",
            },
        ],
    },
    {
        type: "mattermost",
        name: "Mattermost",
        fields: [
            {
                key: "webhookUrl",
                label: "Incoming Webhook URL",
                type: "url",
                required: true,
                placeholder: "https://mattermost.example.com/hooks/…",
            },
            {
                key: "channel",
                label: "Channel (optional)",
                type: "text",
                placeholder: "town-square",
                help: "Overrides the webhook's default channel",
            },
        ],
    },
    {
        type: "apprise",
        name: "Apprise",
        fields: [
            {
                key: "url",
                label: "Apprise API URL",
                type: "url",
                required: true,
                placeholder: "http://apprise:8000/notify/apprise",
                help: "The notify endpoint of an Apprise API server. With a configuration key (/notify/<key>) leave the URLs below empty",
            },
            {
                key: "urls",
                label: "Apprise URLs (optional)",
                type: "text",
                placeholder: "tgram://bottoken/ChatID, pover://user@token",
                help: "Service URLs for the stateless /notify endpoint, separated by commas or spaces",
            },
        ],
    },
    {
        type: "webhook",
        name: "Webhook (JSON)",
        fields: [
            {
                key: "url",
                label: "URL",
                type: "url",
                required: true,
                placeholder: "https://example.com/webhook",
                help: "Receives a POST with event, severity, title, message, stack, service, container, image, host, timestamp and text",
            },
            {
                key: "authorization",
                label: "Authorization Header (optional)",
                type: "password",
                placeholder: "Bearer …",
            },
        ],
    },
];

export function getNotificationProvider(type : string) : NotificationProvider | undefined {
    return NOTIFICATION_PROVIDERS.find(p => p.type === type);
}
