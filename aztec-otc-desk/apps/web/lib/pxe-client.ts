import { createPXEClient, PXE } from '@aztec/aztec.js';

// Singleton PXE client with connection pooling
let pxeClient: PXE | null = null;

export async function getPXEClient(): Promise<PXE> {
  if (!pxeClient) {
    const pxeUrl = process.env.L2_NODE_URL || 'http://localhost:8080';
    pxeClient = createPXEClient(pxeUrl);
  }
  return pxeClient;
}
