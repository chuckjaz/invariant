async function *someTest(): AsyncIterable<string> {
    yield "a"
    yield "b"
    throw Error("some error")
}


async function testSomeTest() {
    try {
        for await (const s of someTest()) {
            console.log(s)
        }
    } catch (e) {
        console.error('CAUGHT', e)
    }
}

testSomeTest()