import axios from "axios";

type AuthMode = "none" | "basic" | "device_code";

type DiscoveryDocument = {
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
};

export type AuthConfig = {
  username: string;
  password: string;
  mode: string;
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcScope: string;
  deviceCodeTimeoutSeconds: number;
  accessToken: string;
  refreshToken: string;
};

export class AuthManager {
  private accessToken = "";
  private refreshToken = "";
  private accessTokenExpiresAt = 0;
  private discovery?: DiscoveryDocument;

  constructor(private config: AuthConfig) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
  }

  get mode(): AuthMode {
    const requested = this.config.mode.toLowerCase();
    if (requested === "device" || requested === "device_code" || requested === "oidc") {
      return "device_code";
    }
    if (requested === "basic" || requested === "credentials") {
      return "basic";
    }
    if (requested === "none") {
      return "none";
    }
    if (this.config.username && this.config.password) {
      return "basic";
    }
    if (this.config.oidcIssuerUrl && this.config.oidcClientId) {
      return "device_code";
    }
    return "none";
  }

  hasAuth(): boolean {
    return this.mode !== "none";
  }

  authRequiredMessage(action: string): string {
    return `Error: Authentication required for ${action}. Configure CATALOGUE_USERNAME/CATALOGUE_PASSWORD or Device Code OIDC environment variables.`;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.mode === "basic") {
      const token = Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64");
      return { Authorization: `Basic ${token}` };
    }

    if (this.mode === "device_code") {
      const token = await this.getDeviceAccessToken();
      return { Authorization: `Bearer ${token}` };
    }

    return {};
  }

  async getCsrfHeaders(baseURL: string): Promise<Record<string, string>> {
    const authHeaders = await this.getAuthHeaders();
    const response = await axios.get(`${baseURL}/site`, {
      headers: {
        ...authHeaders,
        Accept: "application/json",
      },
      validateStatus: () => true,
    });

    const setCookies = response.headers["set-cookie"] || [];
    const cookieHeader = this.toCookieHeader(setCookies);
    const xsrfToken = this.extractCookie(setCookies, "XSRF-TOKEN");

    if (!xsrfToken) {
      throw new Error("GeoNetwork did not return an XSRF-TOKEN cookie for mutating request.");
    }

    return {
      ...authHeaders,
      Cookie: cookieHeader,
      "X-XSRF-TOKEN": xsrfToken,
    };
  }

  private async getDeviceAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    if (this.refreshToken) {
      try {
        const refreshed = await this.refreshDeviceToken();
        this.applyTokenResponse(refreshed);
        return this.accessToken;
      } catch {
        this.refreshToken = "";
      }
    }

    if (!this.config.oidcIssuerUrl || !this.config.oidcClientId) {
      throw new Error("Device Code auth requires OIDC_ISSUER_URL and OIDC_CLIENT_ID.");
    }

    const discovery = await this.discover();
    if (!discovery.device_authorization_endpoint) {
      throw new Error("OIDC issuer does not advertise a device authorization endpoint.");
    }

    const deviceAuth = await this.startDeviceAuthorization(discovery);
    const loginUrl = deviceAuth.verification_uri_complete || deviceAuth.verification_uri;
    console.log("[Auth] Complete Device Code login in a browser:");
    console.log(`[Auth] ${loginUrl}`);
    console.log(`[Auth] User code: ${deviceAuth.user_code}`);

    const token = await this.pollForDeviceToken(discovery, deviceAuth.device_code, deviceAuth.interval || 5);
    this.applyTokenResponse(token);
    return this.accessToken;
  }

  private async discover(): Promise<DiscoveryDocument> {
    if (this.discovery) {
      return this.discovery;
    }
    const issuerUrl = this.config.oidcIssuerUrl.replace(/\/$/, "");
    const response = await axios.get<DiscoveryDocument>(`${issuerUrl}/.well-known/openid-configuration`, {
      headers: { Accept: "application/json" },
    });
    this.discovery = response.data;
    return response.data;
  }

  private async startDeviceAuthorization(discovery: DiscoveryDocument): Promise<DeviceAuthorizationResponse> {
    const body: Record<string, string> = {
      client_id: this.config.oidcClientId,
      scope: this.config.oidcScope,
    };
    if (this.config.oidcClientSecret) {
      body.client_secret = this.config.oidcClientSecret;
    }

    const response = await axios.post<DeviceAuthorizationResponse>(
      discovery.device_authorization_endpoint!,
      this.formEncode(body),
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data;
  }

  private async pollForDeviceToken(discovery: DiscoveryDocument, deviceCode: string, intervalSeconds: number): Promise<TokenResponse> {
    const startedAt = Date.now();
    let currentIntervalSeconds = intervalSeconds;

    while ((Date.now() - startedAt) / 1000 < this.config.deviceCodeTimeoutSeconds) {
      await new Promise((resolve) => setTimeout(resolve, currentIntervalSeconds * 1000));
      const body: Record<string, string> = {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: this.config.oidcClientId,
        device_code: deviceCode,
      };
      if (this.config.oidcClientSecret) {
        body.client_secret = this.config.oidcClientSecret;
      }

      try {
        const response = await axios.post<TokenResponse>(discovery.token_endpoint, this.formEncode(body), {
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

    throw new Error(`Timed out waiting for Device Code authorization after ${this.config.deviceCodeTimeoutSeconds}s`);
  }

  private async refreshDeviceToken(): Promise<TokenResponse> {
    const discovery = await this.discover();
    const body: Record<string, string> = {
      grant_type: "refresh_token",
      client_id: this.config.oidcClientId,
      refresh_token: this.refreshToken,
    };
    if (this.config.oidcClientSecret) {
      body.client_secret = this.config.oidcClientSecret;
    }

    const response = await axios.post<TokenResponse>(discovery.token_endpoint, this.formEncode(body), {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    return response.data;
  }

  private applyTokenResponse(token: TokenResponse): void {
    this.accessToken = token.access_token;
    this.refreshToken = token.refresh_token || this.refreshToken;
    this.accessTokenExpiresAt = Date.now() + token.expires_in * 1000;
  }

  private formEncode(values: Record<string, string>): string {
    return new URLSearchParams(values).toString();
  }

  private toCookieHeader(setCookies: string[]): string {
    return setCookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
  }

  private extractCookie(setCookies: string[], name: string): string {
    const prefix = `${name}=`;
    for (const cookie of setCookies) {
      const part = cookie.split(";")[0];
      if (part.startsWith(prefix)) {
        return part.slice(prefix.length);
      }
    }
    return "";
  }
}
