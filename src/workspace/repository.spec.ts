import { randomId } from "../common/id"
import { ContentLink } from "../common/types"
import { Data } from "../storage/storage_client"
import { Commit, commitFromData, commitToData, Workspace, workspaceFromData, workspaceToData } from "./repository"

describe("workspace/repository", () => {
    it("can read and write a workspace", async () => {
        const workspace: Workspace = {
            workspaceSlot: randomSlot(),
            inputSlot: randomSlot(),
            outputSlot: randomSlot(),
            upstreamSlot: randomSlot(),
            baseCommit: randomContent()
        }
        await writeAndRead(workspace, workspaceToData, workspaceFromData)
    })
    it("can read and write a commit", async () => {
        const commit: Commit = {
            date: new Date().toUTCString(),
            author: "Someone Cool <someone@cool.dev>",
            committer: "Someone Cool <someone@cool.dev>",
            message: "Did something cool",
            content: randomContent(),
            parents: [randomContent()],
            refs: [{ name: 'cl', content: randomContent() }]
        }
        await writeAndRead(commit, commitToData, commitFromData)
    })
})

function randomContent(): ContentLink {
    return { address: randomId() }
}

function randomSlot(): ContentLink {
    return { address: randomId(), slot: true }
}

async function writeAndRead<T>(value: T, writer:  (value: T) => Data, reader: (data: Data) => Promise<T>) {
    const data = writer(value)
    const returnedValue = await reader(data) as T
    expect(returnedValue).toEqual(value)
}