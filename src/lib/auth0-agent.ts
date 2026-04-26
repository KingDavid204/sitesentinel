import { jwtVerify, createRemoteJWKSet } from 'jose'

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE!
const CLIENT_ID = process.env.AUTH0_AGENT_CLIENT_ID!
const CLIENT_SECRET = process.env.AUTH0_AGENT_CLIENT_SECRET!

const JWKS = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
)

let cachedToken: { token: string; expiresAt: number } | null = null

export async function getAgentToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }
  const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      audience: AUTH0_AUDIENCE,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) {
    throw new Error(`Auth0 token fetch failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

export async function verifyAgentToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://${AUTH0_DOMAIN}/`,
    audience: AUTH0_AUDIENCE,
  })
  return payload
}

export async function authenticatedAgentIdentity() {
  const token = await getAgentToken()
  const payload = await verifyAgentToken(token)
  return {
    verified: true,
    agent_id: payload.sub as string,
    issuer: payload.iss as string,
    audience: payload.aud as string | string[],
    expires_at: payload.exp as number,
    issued_at: payload.iat as number,
  }
}
