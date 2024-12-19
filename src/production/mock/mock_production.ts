import { normalizeCode } from "../../common/codes";
import { error } from "../../common/errors";
import { randomId } from "../../common/id";
import { ProductionClient } from "../production_client";

export class MockProduction implements ProductionClient {
    private id = randomId()
    private resultMap = new Map<string, Map<string, string>>()

    async ping(): Promise<string> {
        return this.id
    }

    async get(task: string, input: string): Promise<string | undefined> {
        const normalTask = normalizeCode(task)
        const normalInput = normalizeCode(input)
        if (!normalTask || !normalInput) error('Expected normalizable parameters');
        return this.resultMap.get(normalTask)?.get(normalInput)
    }

    async put(task: string, input: string, output: string): Promise<void> {
        const normalTask = normalizeCode(task)
        const normalInput = normalizeCode(input)
        const normalOutput = normalizeCode(output)
        if (!normalTask || !normalInput || !normalOutput) {
            error('Expected normalizable parameters');
        }
        let taskMap = this.resultMap.get(normalTask)
        if (taskMap === undefined) {
            taskMap = new Map()
            this.resultMap.set(normalTask, taskMap)
        }
        taskMap.set(normalInput, normalOutput)
    }
}

export function mockProduction(): MockProduction {
    return new MockProduction()
}
