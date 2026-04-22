export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_drafts: {
        Row: {
          brand_account_id: string | null
          brand_id: string | null
          draft_body_html: string
          draft_body_text: string | null
          draft_subject: string | null
          generated_at: string
          id: string
          message_id: string
          model_used: string
          reasoning: string | null
          status: string
          tokens_used: number | null
        }
        Insert: {
          brand_account_id?: string | null
          brand_id?: string | null
          draft_body_html: string
          draft_body_text?: string | null
          draft_subject?: string | null
          generated_at?: string
          id?: string
          message_id: string
          model_used?: string
          reasoning?: string | null
          status?: string
          tokens_used?: number | null
        }
        Update: {
          brand_account_id?: string | null
          brand_id?: string | null
          draft_body_html?: string
          draft_body_text?: string | null
          draft_subject?: string | null
          generated_at?: string
          id?: string
          message_id?: string
          model_used?: string
          reasoning?: string | null
          status?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_brand_account_id_fkey"
            columns: ["brand_account_id"]
            isOneToOne: false
            referencedRelation: "brand_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          content_id: string | null
          created_at: string
          filename: string
          id: string
          is_inline: boolean
          message_id: string | null
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          filename: string
          id?: string
          is_inline?: boolean
          message_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          filename?: string
          id?: string
          is_inline?: boolean
          message_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_accounts: {
        Row: {
          avatar_url: string | null
          brand_id: string
          created_at: string
          display_name: string
          email_alias: string | null
          id: string
          is_default: boolean
          role_title: string | null
          signature_html: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          brand_id: string
          created_at?: string
          display_name: string
          email_alias?: string | null
          id?: string
          is_default?: boolean
          role_title?: string | null
          signature_html: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          brand_id?: string
          created_at?: string
          display_name?: string
          email_alias?: string | null
          id?: string
          is_default?: boolean
          role_title?: string | null
          signature_html?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          ai_auto_draft_enabled: boolean
          ai_draft_language: string
          ai_draft_mode: string
          ai_draft_tone: string
          ai_draft_trigger_labels: string[]
          brand_voice: string | null
          color_primary: string
          created_at: string
          default_signature_html: string | null
          display_name: string
          email_address: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          signature_html: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          ai_auto_draft_enabled?: boolean
          ai_draft_language?: string
          ai_draft_mode?: string
          ai_draft_tone?: string
          ai_draft_trigger_labels?: string[]
          brand_voice?: string | null
          color_primary?: string
          created_at?: string
          default_signature_html?: string | null
          display_name: string
          email_address: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          signature_html?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          ai_auto_draft_enabled?: boolean
          ai_draft_language?: string
          ai_draft_mode?: string
          ai_draft_tone?: string
          ai_draft_trigger_labels?: string[]
          brand_voice?: string | null
          color_primary?: string
          created_at?: string
          default_signature_html?: string | null
          display_name?: string
          email_address?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          signature_html?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      drafts: {
        Row: {
          bcc_addresses: Json
          body_html: string | null
          brand_id: string
          cc_addresses: Json
          created_at: string
          id: string
          in_reply_to_message_id: string | null
          subject: string | null
          to_addresses: Json
          updated_at: string
        }
        Insert: {
          bcc_addresses?: Json
          body_html?: string | null
          brand_id: string
          cc_addresses?: Json
          created_at?: string
          id?: string
          in_reply_to_message_id?: string | null
          subject?: string | null
          to_addresses?: Json
          updated_at?: string
        }
        Update: {
          bcc_addresses?: Json
          body_html?: string | null
          brand_id?: string
          cc_addresses?: Json
          created_at?: string
          id?: string
          in_reply_to_message_id?: string | null
          subject?: string | null
          to_addresses?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_in_reply_to_message_id_fkey"
            columns: ["in_reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          created_at: string
          id: string
          imap_host: string
          imap_port: number
          imap_use_tls: boolean
          label: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          smtp_host: string
          smtp_port: number
          smtp_use_tls: boolean
          updated_at: string
          username: string
          vault_secret_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          imap_host?: string
          imap_port?: number
          imap_use_tls?: boolean
          label: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          smtp_host?: string
          smtp_port?: number
          smtp_use_tls?: boolean
          updated_at?: string
          username: string
          vault_secret_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          imap_host?: string
          imap_port?: number
          imap_use_tls?: boolean
          label?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          smtp_host?: string
          smtp_port?: number
          smtp_use_tls?: boolean
          updated_at?: string
          username?: string
          vault_secret_id?: string | null
        }
        Relationships: []
      }
      labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          ai_category: string | null
          ai_category_confidence: number | null
          ai_summary: string | null
          bcc_addresses: Json
          body_html: string | null
          body_text: string | null
          brand_id: string | null
          cc_addresses: Json
          created_at: string
          detected_via: string
          detection_confidence: number | null
          email_account_id: string | null
          from_address: string
          from_name: string | null
          id: string
          imap_folder: string | null
          imap_uid: number | null
          in_reply_to: string | null
          is_outbound: boolean
          is_read: boolean
          message_id_header: string | null
          needs_reply: boolean | null
          raw_headers: Json | null
          received_at: string
          reply_to: string | null
          subject: string | null
          thread_id: string | null
          to_addresses: Json
        }
        Insert: {
          ai_category?: string | null
          ai_category_confidence?: number | null
          ai_summary?: string | null
          bcc_addresses?: Json
          body_html?: string | null
          body_text?: string | null
          brand_id?: string | null
          cc_addresses?: Json
          created_at?: string
          detected_via?: string
          detection_confidence?: number | null
          email_account_id?: string | null
          from_address: string
          from_name?: string | null
          id?: string
          imap_folder?: string | null
          imap_uid?: number | null
          in_reply_to?: string | null
          is_outbound?: boolean
          is_read?: boolean
          message_id_header?: string | null
          needs_reply?: boolean | null
          raw_headers?: Json | null
          received_at: string
          reply_to?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: Json
        }
        Update: {
          ai_category?: string | null
          ai_category_confidence?: number | null
          ai_summary?: string | null
          bcc_addresses?: Json
          body_html?: string | null
          body_text?: string | null
          brand_id?: string | null
          cc_addresses?: Json
          created_at?: string
          detected_via?: string
          detection_confidence?: number | null
          email_account_id?: string | null
          from_address?: string
          from_name?: string | null
          id?: string
          imap_folder?: string | null
          imap_uid?: number | null
          in_reply_to?: string | null
          is_outbound?: boolean
          is_read?: boolean
          message_id_header?: string | null
          needs_reply?: boolean | null
          raw_headers?: Json | null
          received_at?: string
          reply_to?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "messages_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          email_account_id: string | null
          error_message: string | null
          finished_at: string | null
          highest_uid_seen: number | null
          id: string
          messages_fetched: number | null
          started_at: string
          status: string | null
        }
        Insert: {
          email_account_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          highest_uid_seen?: number | null
          id?: string
          messages_fetched?: number | null
          started_at?: string
          status?: string | null
        }
        Update: {
          email_account_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          highest_uid_seen?: number | null
          id?: string
          messages_fetched?: number | null
          started_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_labels: {
        Row: {
          label_id: string
          thread_id: string
        }
        Insert: {
          label_id: string
          thread_id: string
        }
        Update: {
          label_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_labels_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          brand_id: string | null
          created_at: string
          has_attachments: boolean
          id: string
          is_archived: boolean
          is_starred: boolean
          last_message_at: string | null
          message_count: number
          participants: Json
          preview: string | null
          subject: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          has_attachments?: boolean
          id?: string
          is_archived?: boolean
          is_starred?: boolean
          last_message_at?: string | null
          message_count?: number
          participants?: Json
          preview?: string | null
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          has_attachments?: boolean
          id?: string
          is_archived?: boolean
          is_starred?: boolean
          last_message_at?: string | null
          message_count?: number
          participants?: Json
          preview?: string | null
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_vault_secret: { Args: { secret_id: string }; Returns: string }
      upsert_email_account_password: {
        Args: { account_id: string; new_password: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
