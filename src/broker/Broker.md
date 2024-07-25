# The invariant project - Broker protocol

A broker server must implement the broker protocol. The protocol is a set of HTML Requests.

A broker allows mapping server ids to a base url that can be used to access the server. A token may also be supplied that allows access to the server. The url my be a relay and may by limited in how long the server will repond to the returned url so the broker should be queried if the server no longer reponds or the time to live has exceeded.

# Values

## `:id`

A server ID which is a 32 byte hex encoded value.

## `:nonce`

A number used only once which is used to produce `:token` values.

## `:salt`

A hex encoded byte value used by the broker to produce `:token` values.

## `:token`

A authorization token that should be used to access the server if provided.

## `:ttl`

The number of milliseconds the given `:url` is expected to respond to requests (with the given `:token`, if provided). If the value is `0` (or missing) then the `:url` is expected to be available indenfinitly.

## `:url`

The base url to use as prefix for server requests to the server with the given `:id`

# `GET /broker/location/:id`

Retrieve the access information for a server with the given `:id`. The response is either a `text/plain` or an `application/json` response, depending on the type requested by the client.

## `text/plain` format

```
ID: :id
URL: :url
TTL: :ttl
TOKEN: :token
```

where the `TTL` and `TOKEN` lines are optional.

## `application/json`

The JSON response is,

```
{
    "id": ":id",
    "url": ":url",
    "ttl": :ttl,
    "token: ":token"
}
```

where the `"ttl"` and `"token"` fields are optional.

The TypeScript type for the JSON is,

```
interface BrokerGetResponse {
    id: string;
    url: string;
    ttl?: number;
    token?: string;
}
```

where `ttl` must be a positive integer or `0`, if included. If the `:url` is known to have expired its `:ttl` then a value of `1` should be returned instead of `0` or a negative number as the server may still be responding at the previous `url` and, if it is expired, then the client is responsible to request fresh information.

### Implimentation notes

Once a known `:id` has been requested of a broker then the broker should, in parallel, validate the server is still responding to requests if 1) the `:ttl` of the `:url` has expired or 2) the `:url` has not been validated in the last at least minutes 10 minutes. This time should be random over a duration range to avoid harmonic overload of the server.

The `:id` of a server should be the public key of an HMAC pair which can then be used by registered servers to validate any `:token` values provided the broker as they will be signed with the private key of the HMAC pair.

Validation of a server is performed by requesting is `:id` using `/id/` and determining of the `:id` matches the  `:id` register (or being registered). This both detects if the server is responding as well as detects if a server at an end point changed its `:id`.

# GET `/id/`

Determine the `:id` of the server.

# `GET /broker/servers/:kind/`

Get a list of servers that are registered with this broker by kind. If a server  is regisgtered annonmously (e.g. without a `:kind`) then it cannot be queried.

The response is either a `text/plain` or an `application/json` response, depending on the type requested by the client.

## `text/plain`

The format for the response is a `\n` delimited list of `:id` values such as,

```
:id
:id
:id
...
```

## `application/json`

The format of the JSON response is an array of `:id` values.

```
[
    ":id",
    ":id",
    ":id",
    ...
]
```

The TypeScript type for the response is,

```
type BrokerQueryResponse = string[]
```

# `POST /broker/register/`

Register a server with the broker. The request and response are in `application/json` format.

## Request

```
{
    "id": ":id",
    "url": ":url",
    "kind": ":kind"
}
```

where the `"id"` is the `:id` of the server being registered and `"kind"` is an optional server kind.

The TypeScript type for the request is,

```
interface BrokerRegisterRequest {
    id: string;
    url: string;
    kind?: string;
}
```

## Response

The broker responds to the request is of the following format,

```
{
    "id": ":id",
    "salt": ":salt",
    "minnonce": ":nonce"
}
```

where `"id"` is the `:id` of the broker server, `"salt"` is a `:salt` value to use the broker produce a `:token` and `"minnonce"` is a the lowest `:nonce` value the server should recognize from the broker. Both `"salt"` and `"minnonce"` are optional.

The TypeScript type for the response is

```
interface BrokerRegisterResponse {
    id: string;
    salt?: string;
    minnonce?: number;
}
```

