/**
 * This project's own database schema types.
 *
 * Add a table here whenever you create one with a migration, and keep the shape
 * in sync with that migration. `src/lib/supabase.ts` is a platform runtime file
 * that gets rewritten from the factory scaffold on every preview start — table
 * types written there are lost. This file is yours and is never overwritten.
 */
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          wallet_address: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          wallet_address: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          // SSU pricing (project-wide convention); whole-SSU integer.
          price_ssu: string;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price_ssu: string;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          price_ssu?: string;
          image_url?: string | null;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          wallet_address: string;
          item_type: string;
          item_id: string | null;
          item_name: string;
          amount_ssu: string;
          tx_hash: string;
          status: 'paid' | 'refunded' | 'cancelled';
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          item_type: string;
          item_id?: string | null;
          item_name: string;
          amount_ssu: string;
          tx_hash: string;
          status?: 'paid';
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: 'paid' | 'refunded' | 'cancelled';
          metadata?: Record<string, unknown>;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
