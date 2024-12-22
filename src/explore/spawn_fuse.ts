import { spawn } from 'node:child_process'

const command = `/home/chuckjaz/src/invariant_fuse/target/debug/invariant_fuse`

const process = spawn(command, ['http://localhost:3005/', '/home/chuckjaz/mount'])

function decode(data: any): any {
    return typeof data == 'string' ? data : data instanceof Buffer ? new TextDecoder().decode(data) : data
}

process.stdout.on('data', data => {
    console.log('stdout:\n', decode(data))
})

process.stderr.on('data', data => {
    console.log('stderr:\n', decode(data))
})

process.on('close', code => {
    console.log('CODE:', code)
})