import axios from "axios";

export type AuthMode = "none" | "basic" | "device_code";

export type AuthModeConfig = AuthMode | "" | "credentials" | "device" | "oidc";

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

type PendingDeviceLogin = {
  deviceCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  userCode: string;
  expiresAt: number;
  intervalSeconds: number;
  lastPollAt: number;
  discovery: DiscoveryDocument;
};

export type AuthStatus = {
  mode: AuthMode;
  configured: boolean;
  tokenValid: boolean;
  hasRefreshToken: boolean;
  accessTokenExpiresAt?: string;
  pendingLogin?: {
    verificationUri: string;
    verificationUriComplete?: string;
    userCode: string;
    expiresAt: string;
    intervalSeconds: number;
  };
};

export type AuthRequired = {
  type: "auth_required";
  mode: AuthMode;
  message: string;
  next: ["auth_login", "auth_poll", "retry_original_tool"];
};

export type AuthCheck =
  | { authenticated: true }
  | { authenticated: false; required: AuthRequired };

export type DeviceLoginInfo = {
  status: "login_required";
  verificationUri: string;
  verificationUriComplete?: string;
  userCode: string;
  expiresAt: string;
  intervalSeconds: number;
};

export type DevicePollResult =
  | { status: "authenticated"; accessTokenExpiresAt?: string }
  | { status: "pending"; message: string; retryAfterSeconds?: number }
  | { status: "expired"; message: string }
  | { status: "error"; message: string };

export type AuthConfig = {
  username: string;
  password: string;
  mode: AuthModeConfig;
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
  private pendingLogin?: PendingDeviceLogin;
  private startLoginPromise?: Promise<DeviceLoginInfo>;

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
    if (this.mode === "basic") {
      return Boolean(this.config.username && this.config.password);
    }
    if (this.mode === "device_code") {
      return Boolean(this.config.oidcIssuerUrl && this.config.oidcClientId);
    }
    return false;
  }

  getStatus(): AuthStatus {
    const now = Date.now();
    this.clearExpiredPendingLogin(now);
    return {
      mode: this.mode,
      configured: this.hasAuth(),
      tokenValid: this.mode === "basic" ? this.hasAuth() : (this.mode === "device_code" && this.hasValidAccessToken(now)),
      hasRefreshToken: Boolean(this.refreshToken),
      ...(this.accessTokenExpiresAt > 0 && { accessTokenExpiresAt: new Date(this.accessTokenExpiresAt).toISOString() }),
      ...(this.pendingLogin && {
        pendingLogin: {
          verificationUri: this.pendingLogin.verificationUri,
          ...(this.pendingLogin.verificationUriComplete && { verificationUriComplete: this.pendingLogin.verificationUriComplete }),
          userCode: this.pendingLogin.userCode,
          expiresAt: new Date(this.pendingLogin.expiresAt).toISOString(),
          intervalSeconds: this.pendingLogin.intervalSeconds,
        },
      }),
    };
  }

  authRequiredMessage(action: string): string {
    return `Error: Authentication required for ${action}. Configure CATALOGUE_USERNAME/CATALOGUE_PASSWORD or Device Code OIDC environment variables.`;
  }

  authRequired(action: string): AuthRequired {
    return {
      type: "auth_required",
      mode: this.mode,
      message: `Authentication is required before calling ${action}.`,
      next: ["auth_login", "auth_poll", "retry_original_tool"],
    };
  }

  async ensureAuthenticated(action: string): Promise<AuthCheck> {
    if (!this.hasAuth()) {
      return { authenticated: false, required: this.authRequired(action) };
    }
    if (this.mode === "basic") {
      return { authenticated: true };
    }

    const token = await this.tryGetValidDeviceToken();
    if (token) {
      return { authenticated: true };
    }
    return { authenticated: false, required: this.authRequired(action) };
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.mode === "basic") {
      if (!this.config.username || !this.config.password) {
        return {};
      }
      const token = Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64");
      return { Authorization: `Basic ${token}` };
    }

    if (this.mode === "device_code") {
      const token = await this.tryGetValidDeviceToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    }

    return {};
  }

  async startDeviceLogin(): Promise<DeviceLoginInfo> {
    if (this.mode !== "device_code") {
      throw new Error("Device Code login is only available when CATALOGUE_AUTH_MODE=device_code, device, or oidc.");
    }
    if (!this.config.oidcIssuerUrl || !this.config.oidcClientId) {
      throw new Error("Device Code auth requires OIDC_ISSUER_URL and OIDC_CLIENT_ID.");
    }

    const now = Date.now();
    this.clearExpiredPendingLogin(now);
    if (this.pendingLogin) {
      return this.pendingLoginInfo(this.pendingLogin);
    }
    if (this.startLoginPromise) {
      return this.startLoginPromise;
    }

    this.startLoginPromise = this.createDeviceLogin().finally(() => {
      this.startLoginPromise = undefined;
    });
    return this.startLoginPromise;
  }

  async pollDeviceLogin(): Promise<DevicePollResult> {
    if (this.mode !== "device_code") {
      return { status: "error", message: "Device Code polling is only available in device_code auth mode." };
    }
    const now = Date.now();
    this.clearExpiredPendingLogin(now);
    const pending = this.pendingLogin;
    if (!pending) {
      return { status: "expired", message: "No pending Device Code login. Call auth_login to start one." };
    }

    const elapsedSincePoll = pending.lastPollAt ? (now - pending.lastPollAt) / 1000 : Number.POSITIVE_INFINITY;
    if (elapsedSincePoll < pending.intervalSeconds) {
      return {
        status: "pending",
        message: "Login is still pending. Poll again after the requested interval.",
        retryAfterSeconds: Math.ceil(pending.intervalSeconds - elapsedSincePoll),
      };
    }

    pending.lastPollAt = now;
    const body: Record<string, string> = {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: this.config.oidcClientId,
      device_code: pending.deviceCode,
    };
    if (this.config.oidcClientSecret) {
      body.client_secret = this.config.oidcClientSecret;
    }

    try {
      const response = await axios.post<TokenResponse>(pending.discovery.token_endpoint, this.formEncode(body), {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      this.applyTokenResponse(response.data);
      this.pendingLogin = undefined;
      return {
        status: "authenticated",
        accessTokenExpiresAt: this.accessTokenExpiresAt > 0 ? new Date(this.accessTokenExpiresAt).toISOString() : undefined,
      };
    } catch (error: any) {
      const oauthError = error.response?.data?.error;
      if (oauthError === "authorization_pending") {
        return { status: "pending", message: "Browser login has not completed yet.", retryAfterSeconds: pending.intervalSeconds };
      }
      if (oauthError === "slow_down") {
        pending.intervalSeconds += 5;
        return { status: "pending", message: "Identity provider requested slower polling.", retryAfterSeconds: pending.intervalSeconds };
      }
      if (oauthError === "expired_token") {
        this.pendingLogin = undefined;
        return { status: "expired", message: "Device Code login expired. Call auth_login to start a new login." };
      }
      return { status: "error", message: String(error.response?.data?.error_description || error.message || error) };
    }
  }

  logout(): void {
    this.accessToken = "";
    this.refreshToken = "";
    this.accessTokenExpiresAt = 0;
    this.pendingLogin = undefined;
    this.startLoginPromise = undefined;
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

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GeoNetwork CSRF bootstrap failed with HTTP ${response.status} from /site.`);
    }

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
    const existingToken = await this.tryGetValidDeviceToken();
    if (existingToken) {
      return existingToken;
    }

    if (!this.config.oidcIssuerUrl || !this.config.oidcClientId) {
      throw new Error("Device Code auth requires OIDC_ISSUER_URL and OIDC_CLIENT_ID.");
    }

    const discovery = await this.discover();
    if (!discovery.device_authorization_endpoint) {
      throw new Error("OIDC issuer does not advertise a device authorization endpoint.");
    }

    const deviceAuth = await this.startDeviceAuthorization(discovery);
    console.error("[Auth] Complete Device Code login in a browser:");
    console.error(`[Auth] ${deviceAuth.verification_uri_complete || deviceAuth.verification_uri}`);
    console.error(`[Auth] User code: ${deviceAuth.user_code}`);

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
          console.error("[Auth] Device authorization pending.");
          continue;
        }
        if (oauthError === "slow_down") {
          currentIntervalSeconds += 5;
          console.error("[Auth] Device authorization polling slowed by identity provider.");
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

  private hasValidAccessToken(now = Date.now()): boolean {
    return Boolean(this.accessToken && now < this.accessTokenExpiresAt - 30_000);
  }

  private async tryGetValidDeviceToken(): Promise<string> {
    if (this.hasValidAccessToken()) {
      return this.accessToken;
    }
    if (!this.refreshToken) {
      return "";
    }
    try {
      const refreshed = await this.refreshDeviceToken();
      this.applyTokenResponse(refreshed);
      return this.accessToken;
    } catch {
      this.refreshToken = "";
      return "";
    }
  }

  private async createDeviceLogin(): Promise<DeviceLoginInfo> {
    const discovery = await this.discover();
    if (!discovery.device_authorization_endpoint) {
      throw new Error("OIDC issuer does not advertise a device authorization endpoint.");
    }
    const deviceAuth = await this.startDeviceAuthorization(discovery);
    const pending: PendingDeviceLogin = {
      deviceCode: deviceAuth.device_code,
      verificationUri: deviceAuth.verification_uri,
      ...(deviceAuth.verification_uri_complete && { verificationUriComplete: deviceAuth.verification_uri_complete }),
      userCode: deviceAuth.user_code,
      expiresAt: Date.now() + deviceAuth.expires_in * 1000,
      intervalSeconds: deviceAuth.interval || 5,
      lastPollAt: 0,
      discovery,
    };
    this.pendingLogin = pending;
    console.error("[Auth] Device Code login started. Use auth_login response for browser URL and user code.");
    return this.pendingLoginInfo(pending);
  }

  private pendingLoginInfo(pending: PendingDeviceLogin): DeviceLoginInfo {
    return {
      status: "login_required",
      verificationUri: pending.verificationUri,
      ...(pending.verificationUriComplete && { verificationUriComplete: pending.verificationUriComplete }),
      userCode: pending.userCode,
      expiresAt: new Date(pending.expiresAt).toISOString(),
      intervalSeconds: pending.intervalSeconds,
    };
  }

  private clearExpiredPendingLogin(now = Date.now()): void {
    if (this.pendingLogin && now >= this.pendingLogin.expiresAt) {
      this.pendingLogin = undefined;
    }
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
