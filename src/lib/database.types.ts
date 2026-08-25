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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      kreamis: {
        Row: {
          created_at: string
          id: string
          is_hidden: boolean
          like_count: number
          note: string | null
          rating: number
          reply_count: number
          topic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          like_count?: number
          note?: string | null
          rating: number
          reply_count?: number
          topic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          like_count?: number
          note?: string | null
          rating?: number
          reply_count?: number
          topic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kreamis_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kreamis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          follower_count: number
          following_count: number
          handle: string | null
          handle_changed_at: string | null
          id: string
          is_suspended: boolean
          kreami_count: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          follower_count?: number
          following_count?: number
          handle?: string | null
          handle_changed_at?: string | null
          id: string
          is_suspended?: boolean
          kreami_count?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          follower_count?: number
          following_count?: number
          handle?: string | null
          handle_changed_at?: string | null
          id?: string
          is_suspended?: boolean
          kreami_count?: number
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_handles: {
        Row: {
          created_at: string
          handle: string
          reason: string
          reserved_until: string | null
        }
        Insert: {
          created_at?: string
          handle: string
          reason?: string
          reserved_until?: string | null
        }
        Update: {
          created_at?: string
          handle?: string
          reason?: string
          reserved_until?: string | null
        }
        Relationships: []
      }
      topic_aliases: {
        Row: {
          created_at: string
          normalized_title: string
          topic_id: string
        }
        Insert: {
          created_at?: string
          normalized_title: string
          topic_id: string
        }
        Update: {
          created_at?: string
          normalized_title?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_aliases_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_resolution_log: {
        Row: {
          created_at: string
          id: number
          matched_topic_id: string | null
          normalized: string
          outcome: string
          raw_input: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          matched_topic_id?: string | null
          normalized: string
          outcome: string
          raw_input: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          matched_topic_id?: string | null
          normalized?: string
          outcome?: string
          raw_input?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_resolution_log_matched_topic_id_fkey"
            columns: ["matched_topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_resolution_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_hidden: boolean
          kreami_count: number
          merged_into_topic_id: string | null
          normalized_title: string
          rating_sum: number
          slug: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_hidden?: boolean
          kreami_count?: number
          merged_into_topic_id?: string | null
          normalized_title: string
          rating_sum?: number
          slug: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_hidden?: boolean
          kreami_count?: number
          merged_into_topic_id?: string | null
          normalized_title?: string
          rating_sum?: number
          slug?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topics_merged_into_topic_id_fkey"
            columns: ["merged_into_topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_rate_limit: {
        Args: { action: string; max_count: number; window_size: string }
        Returns: undefined
      }
      claim_handle: { Args: { new_handle: string }; Returns: string }
      create_topic: {
        Args: { raw_title: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          is_hidden: boolean
          kreami_count: number
          merged_into_topic_id: string | null
          normalized_title: string
          rating_sum: number
          slug: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "topics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_account: { Args: never; Returns: undefined }
      get_topic_by_slug: {
        Args: { s: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          is_hidden: boolean
          kreami_count: number
          merged_into_topic_id: string | null
          normalized_title: string
          rating_sum: number
          slug: string
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "topics"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      handle_available: { Args: { candidate: string }; Returns: boolean }
      keepalive: { Args: never; Returns: string }
      merge_topics: {
        Args: { loser: string; winner: string }
        Returns: undefined
      }
      normalize_topic_title: { Args: { raw: string }; Returns: string }
      post_kreami: {
        Args: { note?: string; rating: number; raw_title: string }
        Returns: {
          kreami_id: string
          topic_id: string
          topic_slug: string
          was_edit: boolean
        }[]
      }
      recompute_topic_aggregates: {
        Args: { target: string }
        Returns: undefined
      }
      resolve_topic: {
        Args: { raw_title: string }
        Returns: {
          is_new: boolean
          matched_title: string
          topic_id: string
        }[]
      }
      search_topics: {
        Args: { lim?: number; q: string }
        Returns: {
          avg_kreams: number
          id: string
          kreami_count: number
          score: number
          slug: string
          title: string
        }[]
      }
      slugify: { Args: { raw: string }; Returns: string }
      topic_distribution: {
        Args: { target: string }
        Returns: {
          count: number
          rating: number
        }[]
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
