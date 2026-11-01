// Cliente HTTP com token OAuth2 (client_credentials) em cache por tenant
export abstract class OAuthHttpClient {
  private readonly tokens = new Map<
    number,
    { token: string; expiresAt: number }
  >();

  protected abstract readonly baseUrl: string;
  protected abstract requestToken(
    clientId: string,
    clientSecret: string,
  ): Promise<{ token: string; expiresIn: number }>;
  protected abstract credentials(
    tenantId: number,
  ): Promise<{ clientId: string; clientSecret: string } | null>;

  protected async accessToken(tenantId: number) {
    const cached = this.tokens.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const creds = await this.credentials(tenantId);
    if (!creds)
      throw new Error(`Credenciais não configuradas para o tenant ${tenantId}`);
    const { token, expiresIn } = await this.requestToken(
      creds.clientId,
      creds.clientSecret,
    );
    this.tokens.set(tenantId, {
      token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    });
    return token;
  }

  // Credenciais trocadas: descarta o token antigo
  protected forgetToken(tenantId: number) {
    this.tokens.delete(tenantId);
  }

  protected async call<T = unknown>(
    tenantId: number,
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<T> {
    const token = await this.accessToken(tenantId);
    const { json, headers, ...rest } = init;
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json !== undefined && { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    if (!res.ok)
      throw new Error(
        `${this.constructor.name} ${path}: ${res.status} ${await res.text()}`,
      );
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
