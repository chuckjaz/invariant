export interface BrokerRegisterRequest {
    id: string;
    url: string;
    kind?: string;
}

export interface BrokerRegisterResponse {
    id: string;
    salt?: string;
    minnonce?: number;
}