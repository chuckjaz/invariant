import { BrokerClient } from "../broker/broker_client";
import { mockBroker } from "../broker/mock/mock_broker_client";
import { stringsToData } from "../common/data";
import { delay } from "../common/delay";
import { randomId } from "../common/id";
import { dataToString } from "../common/parseJson";
import { ContentLink } from "../common/types";
import { Files } from "../files/files";
import { ContentKind, ContentWriter } from "../files/files_client";
import { FileLayersDescription, LayeredFiles } from "../files/layer/file_layer";
import { mockSlots } from "../slots/mock/slots_mock_client";
import { SlotsClient } from "../slots/slot_client";
import { mockStorage } from "../storage/mock";
import { StorageClient } from "../storage/storage_client";
import { Commit, commitFromData, commitToData } from "./repository";
import { createWorkspace } from "./workspaces";

describe("workspace/workspace", () => {
    // meta-test
    it("can create demo hello world source", async () => {
        const services = mockServices()
        const helloWorldLink = await helloWorldSources(services)

        // Check that the hello world source is created
        const files = new Files(randomId(), services.storage, services.slots, services.broker, 1)
        const root = await files.mount(helloWorldLink, true, true)
        const srcDir = await files.lookup(root, "src");
        expectDefined(srcDir);
        const helloWorldFile = await files.lookup(srcDir, "hello_world.ts");
        expectDefined(helloWorldFile);

        const content = await dataToString(files.readFile(helloWorldFile));
        expect(content).toEqual("console.log('Hello, World!')\n");

        files.stop()
    });
    it("can create an initial commit from initial workspace", async () => {
        const services = mockServices()
        const helloWorldLink = await helloWorldSources(services)
        const files = new Files(randomId(), services.storage, services.slots, services.broker, 1)
        const upstreamLink = await createUpstream(helloWorldLink, files, services.slots);

        // Check that the upstream link is a commit
        const commit = await commitFromData(files.readContentLink(upstreamLink));
        expectDefined(commit);
        expect(commit.content.address).toEqual((await resolveContent(helloWorldLink, services.slots)).address);
        expect(commit.content.slot).toBeUndefined()
        files.stop()
    });
    it("can create a workspace from an initial commit", async () => {
        const services = mockServices()
        const helloWorldLink = await helloWorldSources(services)
        const files = new Files(randomId(), services.storage, services.slots, services.broker, 1)
        const upstreamLink = await createUpstream(helloWorldLink, files, services.slots);

        // Create a workspace from the upstream link
        const workspaceLink = await createWorkspace(upstreamLink.address, services.slots, files, files, services.broker);
        expectDefined(workspaceLink);

        // Check the workspace has been created by mounting it in a layered file system
        const layerFiles = new LayeredFiles(randomId(), files, services.storage, services.slots, services.broker);
        const workspaceRoot = await layerFiles.mount(workspaceLink);

        const srcDir = await layerFiles.lookup(workspaceRoot, "src");
        expectDefined(srcDir);
        const helloWorldFile = await layerFiles.lookup(srcDir, "hello_world.ts");
        expectDefined(helloWorldFile);
        const content = await dataToString(layerFiles.readFile(helloWorldFile));
        expect(content).toEqual("console.log('Hello, World!')\n");
        files.stop
    });
    it("can write to the output layer", async () => {
        const services = mockServices()
        const helloWorldLink = await helloWorldSources(services)
        const files = new Files(randomId(), services.storage, services.slots, services.broker, 1)
        const upstreamLink = await createUpstream(helloWorldLink, files, services.slots);

        // Create a workspace from the upstream link
        const workspaceLink = await createWorkspace(upstreamLink.address, services.slots, files, files, services.broker);
        expectDefined(workspaceLink);

        // Check the workspace has been created by mounting it in a layered file system
        const layerFiles = new LayeredFiles(randomId(), files, services.storage, services.slots, services.broker);
        const workspaceRoot = await layerFiles.mount(workspaceLink);

        // Write to the output layer
        const outputDir = await layerFiles.createNode(workspaceRoot, "out", ContentKind.Directory);
        const outputFile = await layerFiles.createNode(outputDir, "output.txt", ContentKind.File);
        await layerFiles.writeFile(outputFile, stringsToData("This is an output file"));

        // Check the file was written
        const content = await dataToString(layerFiles.readFile(outputFile));
        expect(content).toEqual("This is an output file");

        // Check that the output file when to the output layer
        await delay(2) // Wait for the file to be written
        await layerFiles.sync()
        const layersFile = await layerFiles.lookup(workspaceRoot, ".layers");
        expectDefined(layersFile);
        const layersContent = await dataToString(layerFiles.readFile(layersFile));
        const layers = JSON.parse(layersContent) as FileLayersDescription;
        const outputDirectory = await files.mount(layers[1].content as ContentLink)
        const outDirectory = await files.lookup(outputDirectory, "out");
        expectDefined(outDirectory);
        const outputFileHandle = await files.lookup(outDirectory, "output.txt");
        expectDefined(outputFileHandle);
        const outputFileContent = await dataToString(files.readFile(outputFileHandle));
        expect(outputFileContent).toEqual("This is an output file");
        files.stop
    })
});

function expectDefined<T>(value: T | undefined, message?: string): asserts value is T {
    if (value === undefined) {
        throw new Error(message || "Expected value to be defined");
    }
}

interface Services {
    storage: StorageClient
    slots: SlotsClient;
    broker: BrokerClient;
}

function mockServices(): Services {
    const storage = mockStorage()
    const slots = mockSlots()
    const broker = mockBroker()
    broker.registerSlots(slots)
    return { storage, slots, broker }
}

async function helloWorldSources(services: Services): Promise<ContentLink> {
    const helloWorldSource = "console.log('Hello, World!')\n";

    const files = new Files(randomId(), services.storage, services.slots, services.broker, 1)

    // Create an empty directory
    const link = await files.writeContentLink(stringsToData("[]"))

    // Create slot to store the results of the writes
    const slotId = randomId()
    expect(await services.slots.register({ id: slotId, address: link.address })).toBeTrue()
    const slotLink: ContentLink = { address: slotId, slot: true }

    // Mount the empty directory
    const root = await files.mount(slotLink, true, true)

    // Create a src directory
    const srcDir = await files.createNode(root, "src", ContentKind.Directory);

    const helloWorldHandle = await files.createNode(srcDir, "hello_world.ts", ContentKind.File);
    await files.writeFile(helloWorldHandle, stringsToData([helloWorldSource]));

    const gitIgnoreHandle = await files.createNode(root, ".gitignore", ContentKind.File);
    await files.writeFile(gitIgnoreHandle, stringsToData("coverage/\nnode_modules/\nout/\ndist/"));

    await delay(2)
    await files.sync()
    files.stop()

    return slotLink
}

async function createUpstream(
    content: ContentLink,
    writer: ContentWriter,
    slots: SlotsClient
): Promise<ContentLink> {
    const commit: Commit = {
        date: new Date().toUTCString(),
        author: "Someone Cool",
        committer: "Someone Cool",
        message: "Initial commit",
        content: await resolveContent(content, slots),
        parents: [],
        refs: []
    };
    const commitLink = await writer.writeContentLink(commitToData(commit));
    const upstreamSlotId = randomId();
    expect(await slots.register({ id: upstreamSlotId, address: commitLink.address })).toBeTrue();
    return { address: upstreamSlotId, slot: true }
}

async function resolveContent(content: ContentLink, slots: SlotsClient): Promise<ContentLink> {
    if (content.slot) {
        const slot = await slots.get(content.address);
        if (!slot) throw new Error(`Slot ${content.address} not found`);
        const { address, slot: _, ...rest } = content
        return { address: slot.address, ...rest };
    }
    return content;
}
