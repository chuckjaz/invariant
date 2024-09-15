# The Invariant project - Slots protocol

A slot stores the current version of data. A maintain an ID which is generally the ID of a block that can be obtained by

A slot server is a pingable container of the slots.

# Values

## `:id`

An ID for the slot, slot server or content itself.

## `:signature`

A private key signed hash of the value without its `"signature"` field. This field can be used to validate the slot value has not forged or tampered with.

## `:signature-definition`

A description of the public/private key algoritm and format used for the signature. When using a signature, the `:id` of a slot is the public key of the signature. The algorithm used should produce a public key of at least 256 bits with an even distribution of the first 256 bits of the key. The signature algorithm should be a widely supported algorithm such as ed25519 or x25519.

## `:proof`

A slot defined value that is proof the slot is valid.

## `:proof-defintion`

A description of the proof algorithm and format used for the proof.

# `GET /id/`

Determine the `:id` of the server.

# `GET /slots/:id`

Determine the current value of the slot with the ID :id.

## Reponse

The slot server responds with the following format,

```
{
    "address": :id,
    "signature": :signature,
    "proof": :proof
}
```

field     | meaning
--------- | -------------------------------------------------------
address   | The address of the block stored in a storage server
signature | A private key encoding of "address" where the slot id is the public key.
proof     | A slot defined proof that the slot value is valid.

All but the "address" field is optional. The `"address"` is the address of the block from the storage service for the content.

The TypeScript type for the response is,

```
interface SlotsGetResponse {
    address: string
    signature?: string
    proof?: string
}
```

# `PUT /slots/:id`

Update the value of a slot.

## Request

The request is a JSON object with the following format,

```
{
    "address": :id,
    "previous": :id,
    "signature": :id,
    "proof": :proof
}
```

field     | meaning
--------- | -------------------------------------------------------
address   | The new address of the block stored in a storage server
previous  | The previous address stored in the slot
signature | A signature for address
proof     | A proof that address should be the next value

Only `"address"` and `"previous"` are required for all slots. A slot may require `"signature"` and `"proof"` fields depending on how the slot was created.

If `"previous"` is not equal to the current value of the slot the request to update the slot is rejected.

If `"signature"` is required by the slot decrypting the `:signature` with a slot `:id` as the public key must match the address.

If a slot uses `"proof"`, the other containers for the slot should be consulted to determine if there is a more up-to-date value before accepting or rejecting a new value and only accepting a new value after the proof required cohort of slot servers agree.

The TypeScript type for the request is,

```
interface SlotsPutRequest {
    address: string
    previous: string
    signature?: string
    proof?: string
}
```

# `GET /slots/history/:id`

Request the history for a slot.

Result is a JSON stream of SlotGetRequest objects that are from the current value to the beginning of the
slot.

# `PUT /slots/register/:id`

Register a slot with the slot server.

## Request

The request is a JSON object with the fallowing format,

```
{
    "id": :id,
    "address": :id,
    "signature": :signature-definition,
    "proof": :proof-description,
}
```

field     | meaning
--------- | -------------------------------------------------------
id        | The :id of the slot
address   | The current value address of the slot
signature | A description of the public/private key algorithm and format used to sign addresses
proof     | A description of the proof algorithm and format used to proof new current values

The TypeScript type for the response is,

```
interface SlotsRegisterRequest {
    id: string
    address: string
    signature?: any
    proof?: any
}
```

