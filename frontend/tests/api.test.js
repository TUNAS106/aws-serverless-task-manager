import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

let api
let directory
const originalFetch = globalThis.fetch

before(async () => {
  // Bundle just the service to apply Vite's ENV replacement; no server/network.
  directory = await mkdtemp(join(tmpdir(), 'task-manager-api-test-'))
  await build({
    configFile: false,
    logLevel: 'silent',
    define: {
      'import.meta.env.VITE_USE_MOCK': JSON.stringify('false'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        'https://api.example/prod',
      ),
    },
    build: {
      ssr: resolve('src/services/api.js'),
      outDir: directory,
      emptyOutDir: true,
    },
  })
  api = await import(pathToFileURL(join(directory, 'api.js')).href)
})

after(async () => {
  globalThis.fetch = originalFetch
  if (directory) await rm(directory, { recursive: true })
})

test('detail reads the requested task with auth and propagates 404', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.example/prod/tasks/task-one')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    return new Response(JSON.stringify({ taskId: 'task-one', version: 2 }))
  }
  assert.equal((await api.getTask('task-one', 'test-token')).version, 2)
  globalThis.fetch = async () => new Response('{}', { status: 404 })
  await assert.rejects(
    api.getTask('missing', 'test-token'),
    (error) => error.status === 404,
  )
})

test('uncertain POST asks user to check the list and does not retry', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    throw new TypeError('Network failed')
  }
  await assert.rejects(
    api.saveTask({ title: 'Test' }, null, 'token'),
    /tải lại danh sách/,
  )
  assert.equal(calls, 1)
})

test('successful but malformed response is not treated as a saved task', async () => {
  globalThis.fetch = async () => new Response('<html>proxy error</html>')
  await assert.rejects(
    api.saveTask({ title: 'Test' }, null, 'token'),
    /tránh trùng/,
  )
})

test('POST uses server status default, PUT sends expectedVersion, DELETE accepts 204', async () => {
  let body
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body)
    return new Response(JSON.stringify({ taskId: 'one', version: 3 }))
  }
  await api.saveTask({ title: 'Test', status: 'pending' }, null, 'token')
  assert.equal(body.status, undefined)
  await api.saveTask(
    { title: 'Test', status: 'completed' },
    { taskId: 'one', version: 2 },
    'token',
  )
  assert.equal(body.expectedVersion, 2)
  assert.equal(body.status, 'completed')
  globalThis.fetch = async () => new Response(null, { status: 204 })
  assert.equal(await api.deleteTask('one', 'token'), null)
})
