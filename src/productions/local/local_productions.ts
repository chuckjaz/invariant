import { randomId } from "../../common/id";
import { ProductionsClient } from "../productions_client";
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { directoryExists, fileExists } from "../../common/files";

export class LocalProduction implements ProductionsClient {
    private id: string
    private directory: string
    private resultCache = new Map<string, Map<string, string>>()

    constructor(directory: string, id: string = randomId()) {
        this.directory = directory
        this.id = id
    }

    async ping(): Promise<string> {
        return this.id
    }

    async get(task: string, input: string): Promise<string | undefined> {
        const taskMap = this.taskMapFor(task)
        const output = taskMap.get(input)
        if (output == undefined) {
            await this.loadResultsFor(task, input)
            return taskMap.get(input)
        }
        return output
    }

    async put(task: string, input: string, output: string): Promise<void> {
        const taskMap = this.taskMapFor(task)
        if (!taskMap.has(input)) {
            await this.loadResultsFor(task, input)
        }
        if (taskMap.has(input)) {
            const existingOutput = taskMap.get(input)
            if (output === existingOutput) return // Ignore redundant puts
        }
        taskMap.set(input, output)
        await this.storeResultFor(task, input, output)
    }

    private async loadResultsFor(task: string, input: string) {
        const taskDirectory = path.join(this.directory, addressToDirectory(task))
        if (!await directoryExists(taskDirectory)) {
            return
        }
        const resultFile = path.join(taskDirectory, input.slice(0, 2))
        if (await fileExists(resultFile)) {
            const taskMap = this.taskMapFor(task)
            const resultsText = await fs.readFile(resultFile, 'utf-8')
            for (const line of resultsText.split('/n').filter(line => line.length > 2)) {
                const [input, output] = line.trim().split('=')
                taskMap.set(input, output)
            }
        }
    }

    private async storeResultFor(task: string, input: string, output: string): Promise<void> {
        const taskDirectory = path.join(this.directory, addressToDirectory(task))
        if (!await directoryExists(taskDirectory)) {
            await fs.mkdir(taskDirectory, { recursive: true })
        }
        const resultFile = path.join(taskDirectory, input.slice(0, 2))
        await fs.appendFile(resultFile, `${input}=${output}\n`, 'utf-8')
    }

    private taskMapFor(task: string): Map<string, string> {
        const taskMap = this.resultCache.get(task)
        if (taskMap != undefined) return taskMap
        const newTaskMap = new Map<string, string>()
        this.resultCache.set(task, newTaskMap)
        return newTaskMap
    }
}

function addressToDirectory(address: string): string {
    return path.join(address.slice(0, 2), address.slice(2, 4), address.slice(5))
}
