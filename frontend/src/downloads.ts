import { reactive } from "vue";

/**
 * Downloads pulled chunk by chunk over the socket (see backend/file-transfer.ts), shown in the download tray
 */

export interface DownloadState {
    key: number;
    name: string;
    received: number;
    size: number | null;
    status: "downloading" | "saved" | "failed" | "cancelled";
    error?: string;
    cancel: boolean;
}

interface Root {
    emitAgent(endpoint : string, event : string, ...args : unknown[]) : void;
    toastError(message : string) : void;
}

interface SocketResult {
    ok : boolean;
    msg? : string;
    [key : string] : unknown;
}

export const downloads = reactive<{ list: DownloadState[] }>({
    list: [],
});

let nextKey = 1;

function emit(root : Root, endpoint : string, event : string, ...args : unknown[]) : Promise<SocketResult> {
    return new Promise((resolve) => root.emitAgent(endpoint, event, ...args, resolve));
}

function saveBlob(blob : Blob, name : string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

function finish(state : DownloadState, status : DownloadState["status"], error? : string) {
    state.status = status;
    state.error = error;
    setTimeout(() => {
        const index = downloads.list.indexOf(state);
        if (index >= 0) {
            downloads.list.splice(index, 1);
        }
    }, status === "failed" ? 8000 : 2500);
}

/**
 * Open a transfer with `openEvent` (openFileDownload / openLogDownload), pull it and save it as a file
 */
export async function startDownload(root : Root, endpoint : string, openEvent : string, ...openArgs : unknown[]) {
    const state = reactive<DownloadState>({
        key: nextKey++,
        name: "…",
        received: 0,
        size: null,
        status: "downloading",
        cancel: false,
    });
    downloads.list.push(state);

    const info = await emit(root, endpoint, openEvent, ...openArgs);
    if (!info.ok) {
        root.toastError(info.msg || "Download failed");
        finish(state, "failed", info.msg);
        return;
    }
    state.name = String(info.name);
    state.size = typeof info.size === "number" ? info.size : null;

    const parts : ArrayBuffer[] = [];
    try {
        for (;;) {
            if (state.cancel) {
                await emit(root, endpoint, "closeTransfer", info.id);
                finish(state, "cancelled");
                return;
            }
            const res = await emit(root, endpoint, "readTransfer", info.id);
            if (!res.ok) {
                throw new Error(res.msg || "Download failed");
            }
            const chunk = res.chunk as ArrayBuffer;
            parts.push(chunk);
            state.received += chunk.byteLength;
            if (res.done) {
                break;
            }
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        root.toastError(message);
        finish(state, "failed", message);
        return;
    }

    saveBlob(new Blob(parts), state.name);
    finish(state, "saved");
}
