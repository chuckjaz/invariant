import { BrokerClient } from "../../broker/broker_client"
import { normalizeCode } from "../../common/codes"
import { error } from "../../common/errors"
import { StorageClient } from "../../storage/storage_client"
import { StorageWebClient } from "../../storage/web/storage_web_client"

export async function findStorage(
    broker: BrokerClient,
    storageSpec: string | undefined,
    auth: string | undefined
): Promise<StorageClient> {
    const id = normalizeCode(storageSpec)
    if (storageSpec && !id) {
        let url: URL
        try {
            url = new URL(storageSpec)
        } catch (e) {
            error(`'${storageSpec}' should be a valid URL or a valid storage ID`)
        }
        return new StorageWebClient(url, undefined, auth ? (_, init) => {
            if (init?.method == 'PUT') {
                init.headers = [["X-Custom-Auth-Key", auth]]
            }
            return init
        } : undefined)
    }
    let storageClient: StorageClient | undefined
    if (id) {
        storageClient = await broker.storage(id)
    } else {
        for await (const id of broker.registered('storage')) {
            storageClient = await broker.storage(id)
            if (storageClient && await storageClient.ping() !== undefined) break
        }
    }
    if (!storageClient) error(`Could not find storage ${id}`);
    return storageClient
}
