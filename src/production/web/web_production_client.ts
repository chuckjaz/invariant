import { normalizeCode } from "../../common/codes";
import { error, invalid } from "../../common/errors";
import { PingableClient } from "../../common/pingable_client";
import { ProductionsClient } from "../production_client";

export class ProductionWebClient extends PingableClient implements ProductionsClient{
    constructor(url: URL, id?: string) {
        super(url, id)
    }

    async get(task: string, input: string): Promise<string | undefined> {
        const request = {
            method: 'GET',
            headers: { 'Content-Type': 'text/plain' }
        }
        const normalTask = normalizeCode(task)
        const normalInput = normalizeCode(input)
        if (!normalInput || !normalTask) error('Expected normalizable input')
        const result = await fetch(new URL(`/production/${task}/${input}`, this.url), request)
        if (result.status == 404) return undefined;
        if (result.status >= 500) error(`Error encountered retrieving output: ${result.status}`);
        if (result.status != 200) invalid(`Could not obtain result: ${result.status}`);
        const outputText = await result.text()
        return normalizeCode(outputText)
    }

    async put(task: string, input: string, output: string): Promise<void> {
        const request = {
            method: 'PUT',
            headers: { 'Content-Type': 'text/plain' },
        }
        const normalTask = normalizeCode(task)
        const normalInput = normalizeCode(input)
        const normalOutput = normalizeCode(output)
        if (!normalInput || !normalTask || !normalOutput) error('Expected normalizable input');
        const result = await fetch(new URL(`/production/${task}/${input}?output=${output}`, this.url), request)
        if (result.status != 200) error(`Could not record task result: ${result.status}`);
    }
}