import { Configuration, loadConfiguration, saveConfiguration, ServerConfiguration } from "../../config/config";

export async function addServer(server: ServerConfiguration) {
    const configuration = await loadConfiguration()
    let servers = configuration.servers
    if (!servers) {
        servers = []
        configuration.servers = servers
    }

    servers.push(server)

    await saveConfiguration(configuration)

    console.log(`Added a ${server.server} server:\n  id: ${server.id}\n  directory: ${server.directory}`)
}
