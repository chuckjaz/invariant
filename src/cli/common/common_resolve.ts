import { BrokerClient } from "../../broker/broker_client";
import { normalizeCode } from "../../common/codes";
import { jsonFromText } from "../../common/data";
import { contentLinkSchema } from "../../common/schema";
import { ContentLink } from "../../common/types";
import { NamesDnsClient } from "../../names/dns/names_dns_client";

export async function resolveId(
    broker: BrokerClient,
    id: string,
    assumeSlot: boolean = false
): Promise<ContentLink | undefined> {
    const normalizedId = normalizeCode(id)
    if (normalizedId) {
        // If the id is a valid code, return it
        return { address: normalizedId, slot: assumeSlot }
    }

    // If it is not a code, maybe it the JSON for a content link
    const content = jsonFromText(contentLinkSchema, id) as ContentLink
    if (content) {
        // If the id is a valid content link, return it
        return content
    }

    // If the id is not a valid code, try to resolve it using the broker

    // Try to resolve it first with thought DNS
    const dnsNameService = new NamesDnsClient()
    try {
        const result = await dnsNameService.lookup(id)
        if (result && result.address) {
            if (result.slot) {
                return { address: result.address, slot: true }
            }
            return { address: result.address }
        }
    } catch (e) {
    }


    // Find a name service from the broker
    for await (const nameServerId of broker.registered("names")) {
        const namesClient = await broker.names(nameServerId)
        if (!namesClient) continue
        try {
            const result = await namesClient.lookup(id)
            if (result && result.address) {
                if (result.slot) {
                    return { address: result.address, slot: true }
                }
                return { address: result.address }
            }
        } catch (e) {
        }
    }
}
