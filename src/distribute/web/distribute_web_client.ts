import { PingableClient } from "../../common/pingable_client";
import { DistributorPutPinRequest, DistributorPutUnpinRequest, DistributorPutRegisterStorage, DistributorPutUnregisterStorage, DistributorPostBlocksRequest, DistributorPostBlocksResponse, DistributorPostBlocksResponseItem } from "../../common/types";
import { DistributeClient } from "../distribute_client";

export class DistributeWebClient extends PingableClient implements DistributeClient {
    constructor(url: URL, id?: string) {
        super(url, id)
    }

    async pin(request: DistributorPutPinRequest): Promise<void> {
        await this.putJsonStream(request, '/distributor/pin')
    }

    async unpin(request: DistributorPutUnpinRequest): Promise<void> {
        await this.putJsonStream(request, '/distributor/unpin')
    }

    async register(request: DistributorPutRegisterStorage): Promise<void> {
        await this.putJsonStream(request, '/distributor/register/storage')
    }

    async unregister(request: DistributorPutUnregisterStorage): Promise<void> {
        await this.putJsonStream(request, '/distributor/unregister/storage')
    }

    async *blocks(request: DistributorPostBlocksRequest): DistributorPostBlocksResponse {
        return this.postJsonStreams<string, DistributorPostBlocksResponseItem>(request, '/distributor/blocks')
    }
}
