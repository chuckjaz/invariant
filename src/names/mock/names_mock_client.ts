import { normalizeCode } from "../../common/codes";
import { invalid } from "../../common/errors";
import { randomId } from "../../common/id";
import { LookupResult, NamesClient } from "../names_client";

export class MockNamesClient implements NamesClient {
    private id: string
    private map = new Map<string, MapEntry>()

    constructor(id: string = randomId()) {
        this.id = id
    }

    async ping(): Promise<string> {
        return this.id
    }

    async lookup(name: string): Promise<LookupResult> {
        const eName = effectiveName(name)
        const result = this.map.get(eName)
        if (!result) {
            invalid(`Unknown name ${eName}`)
        }
        return { name: eName, ...result }
    }

    async register(name: string, address: string, ttl: number = 10 * 1000, slot?: boolean): Promise<void> {
        const eName = effectiveName(name)
        const eAddress = normalizeCode(address)
        if (!eAddress) {
            invalid('Invalid address')
        }
        const entry = this.map.get(eName)
        if (entry) {
            invalid('Name already registered')
        }
        const record: MapEntry = { address: eAddress, ttl }
        if (slot === true) record.slot = true
        this.map.set(eName, record)
    }

    async update(name: string, previous: string, address: string, ttl?: number, slot?: boolean): Promise<boolean> {
        const eName = effectiveName(name)
        const ePrevious = normalizeCode(previous)
        if (!ePrevious) {
            invalid('Invalid previous address')
        }
        const eAddress = normalizeCode(address)
        if (!eAddress) {
            invalid('Invalid address')
        }
        const entry = this.map.get(eName)
        if (!entry) {
            invalid(`Unknown name ${eName}`)
        }
        if (ePrevious != entry.address) {
            return false
        }
        entry.address = eAddress
        if (ttl !== undefined) {
            entry.ttl = ttl
        }
        if (slot === true) {
            entry.slot = true
        } else if (slot === false) {
            entry.slot = false
        }
        return true
    }
}

interface MapEntry {
    address: string
    ttl: number
    slot?: boolean
}

function effectiveName(name: string) {
    return name.indexOf('.') >= 0 ? name : `${name}.local`
}