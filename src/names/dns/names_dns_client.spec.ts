import { NamesDnsClient } from "./names_dns_client"

describe("names/dns", () => {
    it("can create a dns names client", () => {
        const client = new NamesDnsClient()
        expect(client).toBeDefined()
    })
    it("can lookup a known name", async () => {
        const client = new NamesDnsClient()
        const result = await client.lookup("invariant.removingalldoubt.dev")
        expect(result.address).toEqual('6362169b014d149d8557cd69276ebb9fe1a29069224ba0467ae74b91eeadb99d')
        expect(result.slot).toBeTrue()
    })
})