import { dataFromReadable } from "../common/data";
import { dataToString } from "../common/parseJson";
import { Data } from "../storage/storage_client";

function dataFromStdin(): Data {
    return dataFromReadable(process.stdin)
}

async function format() {
    const text = await dataToString(dataFromStdin())
    const json = JSON.parse(text)
    const formatted = JSON.stringify(json, null, 2)
    console.log(formatted)
}

format()