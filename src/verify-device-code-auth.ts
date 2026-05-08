#!/usr/bin/env node

import "dotenv/config";
import axios from "axios";

type DiscoveryDocument = {
  issuer: string;
  device_authorization_endpoint?: string;
  token_endpoint: string;
};

type DeviceAuthorizationResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

const requiredEnv = (name: string, fallback?: string): string => {
  const value = process.env[name] || (fallback ? process.env[fallback] : undefined);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}${fallback ? ` or ${fallback}` : ""}`);
  }
  return value;
};

const issuerUrl = requiredEnv("OIDC_ISSUER_URL", "GN_KEYCLOAK_ISSUER").replace(/\/$/, "");
const clientId = requiredEnv("OIDC_CLIENT_ID", "GN_CLIENT_ID");
const clientSecret = process.env.OIDC_CLIENT_SECRET || process.env.GN_CLIENT_SECRET || "";
const scope = process.env.OIDC_SCOPE || "openid profile email";
const geoNetworkApiUrl = (process.env.BASE_URL || requiredEnv("GN_ME_URL").replace(/\/me\/?$/, "")).replace(/\/$/, "");
const pollTimeoutSeconds = Number(process.env.DEVICE_CODE_TIMEOUT_SECONDS || "300");

const formEncode = (values: Record<string, string>) => new URLSearchParams(values).toString();

async function discover(): Promise<DiscoveryDocument> {
  const response = await axios.get<DiscoveryDocument>(`${issuerUrl}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
  });

  if (!response.data.device_authorization_endpoint) {
    throw new Error(`OIDC issuer does not advertise device_authorization_endpoint: ${issuerUrl}`);
  }

  return response.data;
}

async function startDeviceAuthorization(discovery: DiscoveryDocument): Promise<DeviceAuthorizationResponse> {
  const body: Record<string, string> = {
    client_id: clientId,
    scope,
  };

  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await axios.post<DeviceAuthorizationResponse>(
    discovery.device_authorization_endpoint!,
    formEncode(body),
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data;
}

async function pollForToken(discovery: DiscoveryDocument, deviceCode: string, intervalSeconds: number): Promise<TokenResponse> {
  const startedAt = Date.now();
  let currentIntervalSeconds = intervalSeconds;

  while ((Date.now() - startedAt) / 1000 < pollTimeoutSeconds) {
    await new Promise((resolve) => setTimeout(resolve, currentIntervalSeconds * 1000));

    const body: Record<string, string> = {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: clientId,
      device_code: deviceCode,
    };

    if (clientSecret) {
      body.client_secret = clientSecret;
    }

    try {
      const response = await axios.post<TokenResponse>(discovery.token_endpoint, formEncode(body), {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      return response.data;
    } catch (error: any) {
      const oauthError = error.response?.data?.error;
      if (oauthError === "authorization_pending") {
        process.stdout.write(".");
        continue;
      }
      if (oauthError === "slow_down") {
        currentIntervalSeconds += 5;
        process.stdout.write("s");
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Timed out waiting for device authorization after ${pollTimeoutSeconds}s`);
}

async function verifyGeoNetwork(accessToken: string): Promise<void> {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  const meResponse = await axios.get(`${geoNetworkApiUrl}/me`, {
    headers,
    validateStatus: () => true,
  });

  console.log(`\nGeoNetwork /me status: ${meResponse.status}`);
  if (meResponse.status !== 200) {
    throw new Error("GeoNetwork /me did not return authenticated user details.");
  }
  console.log("GeoNetwork /me response:");
  console.log(JSON.stringify(meResponse.data, null, 2));

  const searchResponse = await axios.post(
    `${geoNetworkApiUrl}/search/records/_search`,
    { query: { match_all: {} }, size: 1 },
    {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    }
  );

  console.log(`GeoNetwork search status: ${searchResponse.status}`);
  if (searchResponse.status !== 200) {
    throw new Error("GeoNetwork search failed with Device Code bearer token.");
  }
  const total = searchResponse.data?.hits?.total?.value ?? searchResponse.data?.hits?.total ?? "unknown";
  console.log(`GeoNetwork search total: ${total}`);
}

async function main(): Promise<void> {
  console.log(`OIDC issuer: ${issuerUrl}`);
  console.log(`OIDC client: ${clientId}${clientSecret ? " (with secret)" : " (public/no secret)"}`);
  console.log(`GeoNetwork API: ${geoNetworkApiUrl}`);

  const discovery = await discover();
  const deviceAuth = await startDeviceAuthorization(discovery);
  const loginUrl = deviceAuth.verification_uri_complete || deviceAuth.verification_uri;

  console.log("\nComplete login in a browser:");
  console.log(loginUrl);
  console.log(`User code: ${deviceAuth.user_code}`);
  console.log(`Expires in: ${deviceAuth.expires_in}s`);
  console.log("\nWaiting for authorization");

  const token = await pollForToken(discovery, deviceAuth.device_code, deviceAuth.interval || 5);
  console.log("\nToken received. Verifying GeoNetwork bearer access...");

  await verifyGeoNetwork(token.access_token);
  console.log("Device Code bearer read verification succeeded.");
}

main().catch((error: any) => {
  const responseData = error.response?.data;
  if (responseData) {
    console.error("Request failed:");
    console.error(JSON.stringify(responseData, null, 2));
  } else {
    console.error(error.message || error);
  }
  process.exit(1);
});
