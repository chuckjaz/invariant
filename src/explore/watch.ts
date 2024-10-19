import { watch } from 'node:fs'

watch(process.argv[2], { recursive: true }, (eventType, fileName) => {
    console.log('event', eventType, 'fileName', fileName)
})

