import { invalid } from "../common/errors"
import { Data } from "../storage/storage_client"

const args = process.argv.slice(2)

const owner = 'chuckjaz'
const repository = 'invariant'
const branch = 'main'
const gitRepos = ' https://api.github.com/repos'
const token = process.env['GIT_TOKEN']

const gitHeaders: any = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
}

if (token) {
    gitHeaders['Authorization'] = `Bearer ${token}`
}

const gitRequest = {
    headers: gitHeaders
}

interface GitBlob {
    content: string
    encoding: string
    uri: string
    sha: string
    size: number | null
    node_id: string
    highlighted_content?: string
}

interface GitTreeItem {
    path: string
    mode: string
    type: string
    sha: string
    size?: number
    url: string
}

interface GitTree {
    sha: string
    url: string
    truncated: boolean
    tree: GitTreeItem[]
}

interface GitPerson {
    date: string
    email: string
    name: string
}

interface GitTreeRef {
    sha: string
    uri: string
}

interface GitParentRef {
    sha: string
    url: string
    html_url: string
}

interface GitVerification {
    verified: boolean
    reason: string
    signature: string | null
    payload: string | null
    verified_at?: string | null
}

interface GitCommit {
    sha: string
    node_id: string
    url: string
    author: GitPerson
    committer: GitPerson
    message: string
    tree: GitTreeRef
    parents: GitParentRef[]
    verification: GitVerification
}

interface GitObject {
    type: string
    sha: string
    url: string
}

interface GitRef {
    ref: string
    node_id: string
    url: string
    object: GitObject
}

async function gitFetch(suffix: string): Promise<Response> {
    const url = `${gitRepos}/${owner}/${repository}/git/${suffix}`;
    const result = await fetch(url, { ...gitRequest })
    if (result.status != 200) {
        invalid(`Unexpected response: ${result.status}\n URL: ${url}\n${gitRequest}`)
    }
    return result
}

async function *fetchBlob(sha: string): Data {
    const result = await gitFetch(`blobs/${sha}`)
    const json = await result.json() as GitBlob
    if (json.sha != sha) invalid(`Unexpected response: ${json}`);
    if (json.encoding != 'base64') invalid('Unexpected encoding')
    const data = Buffer.from(json.content, 'base64')
    yield data
}

async function fetchTree(sha: string, recursive?: boolean): Promise<GitTree> {
    const result = await gitFetch(`trees/${sha}${ recursive ? `?recursive=true` : ''}`)
    return await result.json() as GitTree
}

async function fetchCommit(sha: string): Promise<GitCommit> {
    const result = await gitFetch(`commits/${sha}`)
    return await result.json() as GitCommit
}

async function fetchRefs(ref: string): Promise<GitRef[]> {
    const result = await gitFetch(`matching-refs/${ref}`)
    return await result.json() as GitRef[]
}

async function fetchBranch(branch: string): Promise<GitRef> {
    const refs = await fetchRefs(`heads/${branch}`)
    if (refs.length != 1) invalid('Ambiguous reference');
    return refs[0]
}

async function dumpItem(item: GitTreeItem, indent: string, nested: boolean = true) {
    function print(msg: string) {
        console.log(`${indent}${msg}`)
    }

    print(`path: ${item.path}`)
    print(` mode: ${item.mode}`)
    print(` type: ${item.type}`)
    print(` sha:  ${item.sha}`)
    print(` size: ${item.size}`)
    if (item.type == 'tree' && nested) {
        const tree = await fetchTree(item.sha)
        dumpTree(tree, `  ${indent}`)
    }
}

async function dumpTree(tree: GitTree, indent: string = '') {
    function print(msg: string) {
        console.log(`${indent}${msg}`)
    }

    print('tree: -')
    print(` sha:  ${tree.sha}`)
    const nestedIndent = ` ${indent}`
    for (const item of tree.tree) {
        await dumpItem(item, nestedIndent)
    }
}

async function main(branchName: string) {
    const branch = await fetchBranch(branchName)
    const sha = branch.object.sha
    const commit = await fetchCommit(sha)
    const tree = await fetchTree(commit.sha, true)
    for (const item of tree.tree) {
        dumpItem(item, '', false)
    }
}

main(branch)