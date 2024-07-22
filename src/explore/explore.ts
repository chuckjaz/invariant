

async function d() {
    console.log('d')
    const response = await fetch("http://localhost:3001/id/", { })
    if (response.status == 200) {
        const text = await response.text()
        console.log("text", text)
    } else {
        console.log("status", response.status)
    }
}

d().catch(e => {
    console.log(e)
})