import { SlotsGetResponse, SlotsPutRequest, SlotsRegisterRequest } from "../../common/types";
import { SlotsClient } from "../slot_client";
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { randomBytes, verify as vfy, createPublicKey } from 'node:crypto'
import { promisify } from 'node:util'
import { jsonBackwardStream, textStreamFromFileBackward } from "../../common/parseJson";
import { fileExists } from "../../common/files";
import { normalizeCode } from "../../common/codes";
import { lock } from "../../common/lock";

const verify = promisify(vfy)

export class LocalSlots implements SlotsClient {
    id = randomBytes(32).toString('hex')
    private directory: string

    constructor(directory: string) {
        this.directory = directory
    }

    async ping(): Promise<string | undefined> {
        return this.id
    }

    async get(id: string): Promise<SlotsGetResponse> {
        return await this.readState(id)
    }

    async put(id: string, request: SlotsPutRequest): Promise<boolean> {
        const lockFileName = this.toHashPath(id) + '.lock'
        return await lock<boolean>(lockFileName, async () => {
            const state = await this.get(id)
            if (request.previous == state.address) {
                const config = await this.readConfiguration(id)
                switch (config.signature.kind) {
                    case SignatureAlgorithmKind.None:
                        break
                    case SignatureAlgorithmKind.Sha256_Rsa:
                        if (!await verifySignatureShaRsa(request, config.signature)) {
                            // failing
                            return false
                        }
                        break
                    default:
                        return false
                }
                await this.writeState(id, request)
                return true
            }
            return false
        })
    }

    async history(id: string): Promise<AsyncIterable<SlotsGetResponse>> {
        const historyFile = this.toHashPath(id) + '.json.history'
        const textStream = await textStreamFromFileBackward(historyFile)
        return jsonBackwardStream(textStream)
    }

    async register(request: SlotsRegisterRequest): Promise<boolean> {
        const configFile = this.toHashPath(request.id) + '.json.configuration'
        if (await fileExists(configFile)) return false;
        if (request.proof) return false
        let signature: SignatureAlgorithm = { kind: SignatureAlgorithmKind.None }
        if (request.signature && request.signature.kind == SignatureAlgorithmKind.Sha256_Rsa) {
            createPublicKey(request.signature.key)
            signature = {
                kind: SignatureAlgorithmKind.Sha256_Rsa,
                key: request.signature.key
            }
        }
        if (typeof request.address != 'string') return false
        const config: SlotConfiguration = {
            signature,
            proof: ProofAlgorithm.None
        }
        const id = normalizeCode(request.id)
        if (!id) return false
        await this.ensureDir(id)
        await this.writeConfiguration(id, config)
        const state: SlotsGetResponse = {
            address: request.address,
            previous: "root"
        }
        await this.writeState(id, state)
        return true
    }

    private async readState(id: string): Promise<SlotsGetResponse> {
        const fileName = this.toHashPath(id) + '.json'
        try {
            const stateText =  await fs.readFile(fileName, 'utf-8')
            return JSON.parse(stateText)
        } catch (e) {
            throw new Error(`Unknown id: ${id}`)
        }
    }

    private async writeState(id: string, state: SlotsGetResponse): Promise<void> {
        const fileName = this.toHashPath(id) + '.json'
        const historyFile = this.toHashPath(id) + '.json.history'
        const stateText = JSON.stringify(state)
        const stateResult = fs.writeFile(fileName, stateText, 'utf-8')
        const historyResult = fs.appendFile(historyFile, stateText, 'utf-8')
        return Promise.all([stateResult, historyResult]).then(() => { return void 0; })
    }

    private async ensureDir(id: string): Promise<void> {
        const dir = path.dirname(this.toHashPath(id))
        await fs.mkdir(dir, { recursive: true })
    }

    private async readConfiguration(id: string): Promise<SlotConfiguration> {
        const configurationPath = this.toHashPath(id) + '.configuration.json'
        const configurationText = await fs.readFile(configurationPath, 'utf-8')
        const configuration = JSON.parse(configurationText)
        return configuration
    }

    private async writeConfiguration(id: string, config: SlotConfiguration): Promise<void> {
        const configurationPath = this.toHashPath(id) + '.configuration.json'
        const configurationText = JSON.stringify(config)
        return fs.writeFile(configurationPath, configurationText, 'utf-8')
    }

    private toHashPath(hashCode: string): string {
        return path.join(this.directory, 'sha256', hashCode.slice(0, 2), hashCode.slice(2, 4), hashCode.slice(4))
    }
}


enum SignatureAlgorithmKind {
    None = "none",
    Sha256_Rsa = "sha256:rsa",
}

enum ProofAlgorithm {
    None = "none",
    ProofOfWork4 = "proof-of-work:4",
}

interface SignatureAlgorithmNone {
    kind: SignatureAlgorithmKind.None
}

interface SignatureAlgorithmSha256Rsa {
    kind: SignatureAlgorithmKind.Sha256_Rsa
    key: string
}

type SignatureAlgorithm = SignatureAlgorithmNone | SignatureAlgorithmSha256Rsa

interface SlotConfiguration {
    signature: SignatureAlgorithm
    proof: ProofAlgorithm
}

async function verifySignatureShaRsa(request: SlotsPutRequest, config: SignatureAlgorithmSha256Rsa): Promise<boolean> {
    const signatureText = request.signature
    if (!signatureText) return false
    const signature = Buffer.from(signatureText, 'hex')
    let previous = request.previous
    if (previous == "root") {
        previous = ""
    }
    const data = Buffer.from(request.address + '0000' + previous)
    const publicKey = createPublicKey(config.key)
    return await verify("sha256", data, publicKey, signature)
}