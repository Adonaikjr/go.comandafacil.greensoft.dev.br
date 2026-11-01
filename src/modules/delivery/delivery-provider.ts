// Contrato comum das integrações de delivery (iFood, Keeta). Cada provider
// sabe falar com a API do marketplace e gravar na sua tabela local.

export interface DeliveryCredentials {
  clientId: string;
  clientSecret: string;
  storeId: string; // merchant_id (iFood) / restaurant_id (Keeta)
}

export interface ImportedOrder {
  externalId: string;
  customerName: string;
  total: number;
  status: string;
  raw: unknown;
  // id do evento a confirmar (acknowledge) depois de salvar, quando a API exige
  ackId?: string;
}

// Linha de <provider>_orders (inclui ifood_order_id/keeta_order_id) + externalId
export type LocalOrder = {
  id: number;
  externalId: string;
  status: string;
} & Record<string, unknown>;

export interface DeliveryProvider {
  readonly name: 'ifood' | 'keeta';
  readonly storeIdField: 'merchant_id' | 'restaurant_id';

  // Credenciais (tabela <provider>_credentials)
  findCredentials(
    tenantId: number,
  ): Promise<(DeliveryCredentials & { isActive: boolean }) | null>;
  saveCredentials(
    tenantId: number,
    credentials: DeliveryCredentials,
  ): Promise<void>;
  tenantsWithActiveCredentials(): Promise<number[]>;

  // API do marketplace
  fetchNewOrders(tenantId: number): Promise<ImportedOrder[]>;
  acknowledge(tenantId: number, ackIds: string[]): Promise<void>;
  getOrderDetail(tenantId: number, externalId: string): Promise<unknown>;
  confirm(tenantId: number, externalId: string): Promise<void>;
  startPreparation(tenantId: number, externalId: string): Promise<void>;
  readyToPickup(tenantId: number, externalId: string): Promise<void>;
  cancel(tenantId: number, externalId: string, reason?: string): Promise<void>;

  // Pedidos importados (tabela <provider>_orders)
  saveLocal(tenantId: number, order: ImportedOrder): Promise<number>;
  listOpenLocal(tenantId: number): Promise<LocalOrder[]>;
  updateLocalStatus(
    tenantId: number,
    externalId: string,
    status: string,
  ): Promise<void>;
}
