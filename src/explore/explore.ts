import { createServer } from 'node:http'

const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Hello')
    console.log('address', req.socket.remoteAddress, 'port', req.socket.remotePort)
})

server.listen(1337)