// Public Cognito client: Authorization Code + PKCE; no client secret.
const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
const domain = import.meta.env.VITE_COGNITO_DOMAIN?.replace(/\/$/, '')
const redirectUri = import.meta.env.VITE_REDIRECT_URI || `${location.origin}/`
const sessionKey = 'task-manager-session'
const flowKey = 'task-manager-login'

function checkConfig() {
  if (!poolId || !clientId || !domain)
    throw new Error(
      'Chưa cấu hình Cognito. Xem hướng dẫn trong frontend/README.md.',
    )
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function decodeBytes(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')),
    (char) => char.charCodeAt(0),
  )
}

function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}
function issuer() {
  return `https://cognito-idp.${poolId.split('_')[0]}.amazonaws.com/${poolId}`
}

async function verifyIdToken(token, nonce) {
  const [headerPart, payloadPart, signaturePart] = token.split('.')
  const header = JSON.parse(new TextDecoder().decode(decodeBytes(headerPart)))
  const claims = JSON.parse(new TextDecoder().decode(decodeBytes(payloadPart)))
  if (
    header.alg !== 'RS256' ||
    claims.iss !== issuer() ||
    claims.aud !== clientId ||
    claims.token_use !== 'id' ||
    !claims.sub ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= Date.now() ||
    claims.nonce !== nonce
  )
    throw new Error('ID token không hợp lệ. Vui lòng đăng nhập lại.')
  const response = await fetch(`${issuer()}/.well-known/jwks.json`)
  if (!response.ok) throw new Error('Không tải được khóa xác minh Cognito.')
  const { keys } = await response.json()
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA')
  if (!jwk) throw new Error('Không tìm thấy khóa xác minh ID token.')
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  )
  if (!valid) throw new Error('Chữ ký ID token không hợp lệ.')
  return claims
}

export async function login() {
  checkConfig()
  const flow = {
    state: randomString(),
    nonce: randomString(),
    verifier: randomString(),
    createdAt: Date.now(),
  }
  sessionStorage.setItem(flowKey, JSON.stringify(flow))
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(flow.verifier),
      ),
    ),
  )
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })
  location.assign(`${domain}/oauth2/authorize?${params}`)
}

// Share the code exchange across StrictMode's development effect replays.
let callbackPromise
export async function restoreSession() {
  const params = new URLSearchParams(location.search)
  if (params.has('code') || params.has('error')) {
    callbackPromise ||= finishLogin(params).finally(() => {
      sessionStorage.removeItem(flowKey)
      params.delete('code')
      params.delete('state')
      params.delete('error')
      params.delete('error_description')
      history.replaceState(
        {},
        '',
        `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`,
      )
    })
    return callbackPromise
  }
  const saved = sessionStorage.getItem(sessionKey)
  if (!saved) return null
  try {
    const user = JSON.parse(saved)
    if (user.expires_at * 1000 > Date.now()) return user
  } catch {
    /* Discard invalid sessions. */
  }
  sessionStorage.removeItem(sessionKey)
  return null
}

async function finishLogin(params) {
  checkConfig()
  const flow = JSON.parse(sessionStorage.getItem(flowKey) || 'null')
  if (
    !flow ||
    params.get('state') !== flow.state ||
    Date.now() - flow.createdAt > 600000
  )
    throw new Error(
      'Phiên xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    )
  if (params.has('error'))
    throw new Error('Đăng nhập chưa hoàn tất. Vui lòng thử lại.')
  const response = await fetch(`${domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: params.get('code'),
      redirect_uri: redirectUri,
      code_verifier: flow.verifier,
    }),
  })
  if (!response.ok)
    throw new Error(
      'Không đổi được mã đăng nhập. Kiểm tra cấu hình Cognito và callback URL.',
    )
  const tokens = await response.json()
  const profile = await verifyIdToken(tokens.id_token, flow.nonce)
  const user = { id_token: tokens.id_token, expires_at: profile.exp, profile }
  sessionStorage.setItem(sessionKey, JSON.stringify(user))
  return user
}

export async function logout() {
  checkConfig()
  sessionStorage.removeItem(sessionKey)
  sessionStorage.removeItem(flowKey)
  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: import.meta.env.VITE_LOGOUT_URI || `${location.origin}/`,
  })
  location.assign(`${domain}/logout?${params}`)
}
