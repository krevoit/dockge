import crypto from "node:crypto";
import { Readable } from "node:stream";
import { ValidationError } from "./util-server";

/**
 * Chunked downloads over the socket. A transfer wraps a readable stream (a file, `docker exec cat`,
 * `docker compose logs`, ...) and the browser pulls it chunk by chunk, so it also works through
 * remote agents and the stream is only read as fast as the browser takes it.
 */

const CHUNK_BYTES = 512 * 1024;
const IDLE_TIMEOUT_MS = 60 * 1000;
const MAX_PER_OWNER = 3;
const MAX_TOTAL = 20;

export interface TransferInfo {
    id: string;
    name: string;
    size: number | null;
}

export interface TransferChunk {
    chunk: Buffer;
    done: boolean;
}

interface Transfer extends TransferInfo {
    owner: string;
    stream: Readable;
    iterator: AsyncIterator<Buffer | string>;
    lastUsed: number;
    busy: boolean;
}

export class TransferManager {
    protected transfers = new Map<string, Transfer>();
    protected cleaner? : NodeJS.Timeout;

    /**
     * @param owner The socket that may read the transfer
     */
    open(owner : string, stream : Readable, name : string, size : number | null) : TransferInfo {
        const owned = [ ...this.transfers.values() ].filter(t => t.owner === owner).length;
        if (owned >= MAX_PER_OWNER || this.transfers.size >= MAX_TOTAL) {
            stream.destroy();
            throw new ValidationError("Too many downloads at once, wait for one to finish");
        }

        const id = crypto.randomBytes(16).toString("hex");
        this.transfers.set(id, {
            id,
            name,
            size,
            owner,
            stream,
            iterator: stream[Symbol.asyncIterator](),
            lastUsed: Date.now(),
            busy: false,
        });
        this.startCleaner();
        return {
            id,
            name,
            size,
        };
    }

    async read(owner : string, id : unknown) : Promise<TransferChunk> {
        const transfer = typeof id === "string" ? this.transfers.get(id) : undefined;
        if (!transfer || transfer.owner !== owner) {
            throw new ValidationError("Download not found or expired");
        }
        if (transfer.busy) {
            throw new ValidationError("A chunk of this download is already being read");
        }
        transfer.busy = true;
        transfer.lastUsed = Date.now();

        const parts : Buffer[] = [];
        let length = 0;
        let done = false;
        try {
            while (length < CHUNK_BYTES) {
                const next = await transfer.iterator.next();
                if (next.done) {
                    done = true;
                    break;
                }
                const part = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
                parts.push(part);
                length += part.length;
            }
        } catch (e) {
            this.close(owner, id);
            throw e;
        } finally {
            transfer.busy = false;
            transfer.lastUsed = Date.now();
        }

        if (done) {
            this.close(owner, id);
        }
        return {
            chunk: Buffer.concat(parts, length),
            done,
        };
    }

    close(owner : string, id : unknown) {
        const transfer = typeof id === "string" ? this.transfers.get(id) : undefined;
        if (transfer && transfer.owner === owner) {
            this.transfers.delete(transfer.id);
            transfer.stream.destroy();
        }
    }

    closeOwner(owner : string) {
        for (const transfer of [ ...this.transfers.values() ]) {
            if (transfer.owner === owner) {
                this.close(owner, transfer.id);
            }
        }
    }

    protected startCleaner() {
        if (this.cleaner) {
            return;
        }
        this.cleaner = setInterval(() => {
            const now = Date.now();
            for (const transfer of [ ...this.transfers.values() ]) {
                if (!transfer.busy && now - transfer.lastUsed > IDLE_TIMEOUT_MS) {
                    this.close(transfer.owner, transfer.id);
                }
            }
            if (this.transfers.size === 0 && this.cleaner) {
                clearInterval(this.cleaner);
                this.cleaner = undefined;
            }
        }, 15 * 1000);
        this.cleaner.unref();
    }
}

export const transfers = new TransferManager();
