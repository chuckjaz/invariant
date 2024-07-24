import { delay } from "./delay"
import { BrokerRegisterResponse } from "./types"

const BROKER_URL = 'INVARIANT_BROKER'
const SERVER_URL = 'INVARIANT_SERVER_URL'

export async function registerWithBroker(id: string, kind?: string): Promise<BrokerRegisterResponse | undefined> {
    const brokerUrl = process.env[BROKER_URL]
    const serverUrl = process.env[SERVER_URL]
    try {
        if (brokerUrl && serverUrl) {
            const registerUrl = new URL('/broker/register/', brokerUrl)
            const message = JSON.stringify({ id, url: serverUrl, kind })
            await delay(500)
            const response = await fetch(registerUrl, { method: 'POST', body: message })
            if (response.status == 200) {
                const responseText = await response.text()
                const responseObject = JSON.parse(responseText) as BrokerRegisterResponse
                return { id: responseObject.id, salt: responseObject.salt, minnonce: responseObject.minnonce }
            } else {
                console.log('Unexpected broker response:', response)
            }
        }
    } catch (e) {
        console.log('register', e)
    }
    return undefined
}