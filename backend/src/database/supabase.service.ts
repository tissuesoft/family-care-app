import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// CommonJS interop: default import from 'ws' is undefined without esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WS = require('ws') as typeof import('ws');

const supabaseClientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WS as never },
};

@Injectable()
export class SupabaseService implements OnModuleInit {
  private adminClient!: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const serviceKey = this.config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    this.adminClient = createClient(url, serviceKey, supabaseClientOptions);
  }

  get admin(): SupabaseClient {
    return this.adminClient;
  }

  clientWithJwt(jwt: string): SupabaseClient {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');
    return createClient(url, anonKey, {
      ...supabaseClientOptions,
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  }

  async getUserFromToken(token: string) {
    const { data, error } = await this.adminClient.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return data.user;
  }
}
