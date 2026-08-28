import { createECDH, createHmac } from "crypto";
import webPush from "web-push";

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

export function getVapidKeys() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  const privateKey = createHmac("sha256", serviceRoleKey)
    .update("darba-laika-app:web-push:v1")
    .digest();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateKey);

  return {
    privateKey: base64Url(privateKey),
    publicKey: base64Url(ecdh.getPublicKey(undefined, "uncompressed")),
  };
}

export function configureWebPush() {
  const keys = getVapidKeys();
  if (!keys) return null;
  webPush.setVapidDetails(
    "mailto:notifications@darba-laika-app.vercel.app",
    keys.publicKey,
    keys.privateKey,
  );
  return webPush;
}
