import { DistributorPostBlocksRequest, DistributorPostBlocksResponse, DistributorPutPinRequest, DistributorPutRegisterStorage, DistributorPutUnpinRequest, DistributorPutUnregisterStorage } from "../common/types";

export interface DistributeClient {
    pin(request: DistributorPutPinRequest): Promise<void>
    unpin(request: DistributorPutUnpinRequest): Promise<void>
    register(request: DistributorPutRegisterStorage): Promise<void>
    unregister(request: DistributorPutUnregisterStorage): Promise<void>
    blocks(request: DistributorPostBlocksRequest): DistributorPostBlocksResponse
}
