import { BrokerClient } from "../broker/broker_client";
import { resolveId } from "../cli/common/common_resolve";
import { invalid } from "../common/errors";
import { randomId } from "../common/id";
import { dataFromString } from "../common/parseJson";
import { ContentLink, ContentLinkTemplate, Entry, EntryKind } from "../common/types";
import { ContentReader, ContentWriter } from "../files/files_client";
import { FileLayerDescription, LayerKind } from "../files/layer/file_layer";
import { SlotsClient } from "../slots/slot_client";
import { commitFromData, Workspace, workspaceToData } from "./repository";

export async function createWorkspace(
    upstream: string,
    slots: SlotsClient,
    writer: ContentWriter,
    reader: ContentReader,
    broker: BrokerClient,
): Promise<ContentLink> {
    // Resolve the upstream branch
    const upstreamLink = await resolveId(broker, upstream, true)
    if (!upstreamLink) invalid(`Could not resolve '${upstream}'`)
    if (!upstreamLink.slot) invalid(`Branch '${upstream} does not reference a slot`);
    const baseCommit = await resolveSlotLink(slots, upstreamLink);

    // Reader the commit in the slot
    const commit = await commitFromData(reader.readContentLink(baseCommit));
    const additionalFields: ContentLinkTemplate = upstreamLink.transforms ? { transforms: upstreamLink.transforms } : {}

    // Write an empty directory to use for initial slot values
    const emptyDirectory = await writer.writeContentLink(dataFromString(JSON.stringify([])))

    // Create the slots for the workspace
    const workspaceSlotId = randomId()
    const inputSlotId = await createNewSlot(slots, commit.content.address)
    const outputSlotId = await createNewSlot(slots, emptyDirectory.address)

    // Create the links
    const workspaceSlotLink = addressLink(workspaceSlotId)
    const inputSlotLink = addressLink(inputSlotId)
    const outputSlotLink = addressLink(outputSlotId)

    // Create a configuration for the output that maps the input and
    const inputLayer: FileLayerDescription = {
        kind: LayerKind.Ignore,
        content: inputSlotLink,

        // Ignore the layer and workspace description in the output
        ignore: ['.layers', '.workspace'],

        // Pay attention to ignores in .gitignore and .ignore
        ignoreFiles: ['.gitignore', '.ignore']
    }

    const outputLayer: FileLayerDescription = {
        kind: LayerKind.Ignore,
        content: outputSlotLink,

        // Ignore the layer and workspace description in the output
        ignore: ['.layers', '.workspace'],
    }

    const workspaceLayer: FileLayerDescription = {
        kind: LayerKind.Base,
        content: "Self"
    }

    const layerDescription = [inputLayer, outputLayer, workspaceLayer]

    // Write the layer description to a file
    const layerDescriptionLink = await writer.writeContentLink(dataFromString(JSON.stringify(layerDescription)))

    // Create the workspace description
    const workspace: Workspace = {
        workspaceSlot: workspaceSlotLink,
        inputSlot: inputSlotLink,
        outputSlot: outputSlotLink,
        upstreamSlot: upstreamLink,
        baseCommit
    }
    const workspaceLink = await writer.writeContentLink(workspaceToData(workspace))

    //  Create the initial directory for the workspace configuration
    const workspaceEntries: Entry[] = [
        { kind: EntryKind.File, name: '.layers', content: layerDescriptionLink },
        { kind: EntryKind.File, name: '.workspace', content: workspaceLink }
    ]

    // Write the configuration and create its slot
    const initialConfigurationLink = await writer.writeContentLink(dataFromString(JSON.stringify(workspaceEntries)))
    await createNewSlot(slots, initialConfigurationLink.address, workspaceSlotId)

    return workspaceSlotLink

    function addressLink(address: string): ContentLink {
        return { address, slot: true, ...additionalFields }
    }
}

async function createNewSlot(
    slots: SlotsClient,
    address: string,
    id: string = randomId()
): Promise<string> {
    const result = await slots.register({ id, address })
    if (!result) invalid("Could not create a new slot");
    return id
}

async function resolveSlotLink(
    slots: SlotsClient,
    content: ContentLink
): Promise<ContentLink> {
    if (!content.slot) return content;
    const currentSlot = await slots.get(content.address);
    if (!currentSlot) invalid(`Could not resolve slot '${content.address}'`);
    const { address: _, slot: __, ...rest } = content;
    return { address: currentSlot.address, ...rest };
}
