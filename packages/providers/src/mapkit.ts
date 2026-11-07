import { importPKCS8, SignJWT } from "jose";

/** Signs a short-lived MapKit JS token server-side. Origin-restricted. */
export async function signMapkitToken(opts: { teamId: string; keyId: string; privateKey: string; origin: string; ttlSeconds?: number }): Promise<string> {
  const key = await importPKCS8(opts.privateKey.replace(/\\n/g, "\n"), "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ origin: opts.origin })
    .setProtectedHeader({ alg: "ES256", kid: opts.keyId, typ: "JWT" })
    .setIssuer(opts.teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.ttlSeconds ?? 1800))
    .sign(key);
}
