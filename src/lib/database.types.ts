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
      experience_aliases: {
        Row: {
          created_at: string
          experience_id: string
          normalized_title: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          normalized_title: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          normalized_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_aliases_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_resolution_log: {
        Row: {
          created_at: string
          id: number
          matched_experience_id: string | null
          normalized: string
          outcome: string
          raw_input: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          matched_experience_id?: string | null
          normalized: string
          outcome: string
          raw_input: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          matched_experience_id?: string | null
          normalized?: string
          outcome?: string
          raw_input?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_resolution_log_matched_experience_id_fkey"
            columns: ["matched_experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_resolution_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      experiences: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_hidden: boolean
          kreami_count: number
          merged_into_experience_id: string | null
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
          merged_into_experience_id?: string | null
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
          merged_into_experience_id?: string | null
          normalized_title?: string
          rating_sum?: number
          slug?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_merged_into_experience_id_fkey"
            columns: ["merged_into_experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kreamis: {
        Row: {
          created_at: string
          experience_id: string
          id: string
          is_hidden: boolean
          like_count: number
          note: string | null
          rating: number
          reply_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          id?: string
          is_hidden?: boolean
          like_count?: number
          note?: string | null
          rating: number
          reply_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          id?: string
          is_hidden?: boolean
          like_count?: number
          note?: string | null
          rating?: number
          reply_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kreamis_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
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
      likes: {
        Row: {
          created_at: string
          kreami_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          kreami_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          kreami_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_kreami_id_fkey"
            columns: ["kreami_id"]
            isOneToOne: false
            referencedRelation: "kreamis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
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
      replies: {
        Row: {
          body: string
          created_at: string
          id: string
          is_hidden: boolean
          kreami_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          kreami_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          kreami_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replies_kreami_id_fkey"
            columns: ["kreami_id"]
            isOneToOne: false
            referencedRelation: "kreamis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_user_id_fkey"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_experiences: {
        Args: { lim?: number }
        Returns: {
          avg_kreams: number
          id: string
          kreami_count: number
          recent_count: number
          slug: string
          title: string
        }[]
      }
      assert_rate_limit: {
        Args: { action: string; max_count: number; window_size: string }
        Returns: undefined
      }
      claim_handle: { Args: { new_handle: string }; Returns: string }
      create_experience: {
        Args: { raw_title: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          is_hidden: boolean
          kreami_count: number
          merged_into_experience_id: string | null
          normalized_title: string
          rating_sum: number
          slug: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "experiences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_account: { Args: never; Returns: undefined }
      experience_distribution: {
        Args: { target: string }
        Returns: {
          count: number
          rating: number
        }[]
      }
      get_experience_by_slug: {
        Args: { s: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          is_hidden: boolean
          kreami_count: number
          merged_into_experience_id: string | null
          normalized_title: string
          rating_sum: number
          slug: string
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "experiences"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      global_feed: {
        Args: { before?: string; lim?: number }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          experience_avg: number
          experience_id: string
          experience_kreami_count: number
          experience_slug: string
          experience_title: string
          handle: string
          kreami_id: string
          like_count: number
          liked_by_me: boolean
          note: string
          rating: number
          reply_count: number
          user_id: string
        }[]
      }
      handle_available: { Args: { candidate: string }; Returns: boolean }
      home_feed: {
        Args: { before?: string; lim?: number }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          experience_avg: number
          experience_id: string
          experience_kreami_count: number
          experience_slug: string
          experience_title: string
          handle: string
          kreami_id: string
          like_count: number
          liked_by_me: boolean
          note: string
          rating: number
          reply_count: number
          user_id: string
        }[]
      }
      keepalive: { Args: never; Returns: string }
      merge_experiences: {
        Args: { loser: string; winner: string }
        Returns: undefined
      }
      normalize_experience_title: { Args: { raw: string }; Returns: string }
      post_kreami: {
        Args: { note?: string; rating: number; raw_title: string }
        Returns: {
          experience_id: string
          experience_slug: string
          kreami_id: string
          was_edit: boolean
        }[]
      }
      post_reply: { Args: { body: string; target: string }; Returns: string }
      profile_followers: {
        Args: { before?: string; lim?: number; target: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          followed_at: string
          follower_count: number
          handle: string
          id: string
          is_following: boolean
          is_self: boolean
        }[]
      }
      profile_following: {
        Args: { before?: string; lim?: number; target: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          followed_at: string
          follower_count: number
          handle: string
          id: string
          is_following: boolean
          is_self: boolean
        }[]
      }
      profile_kreamis: {
        Args: { lim?: number; sort?: string; target: string }
        Returns: {
          created_at: string
          experience_avg: number
          experience_id: string
          experience_kreami_count: number
          experience_slug: string
          experience_title: string
          kreami_id: string
          like_count: number
          note: string
          rating: number
          reply_count: number
        }[]
      }
      public_profile: {
        Args: { target_handle: string }
        Returns: {
          avatar_url: string
          avg_kream_given: number
          bio: string
          display_name: string
          follower_count: number
          following_count: number
          handle: string
          id: string
          is_following: boolean
          is_self: boolean
          kreami_count: number
        }[]
      }
      recompute_experience_aggregates: {
        Args: { target: string }
        Returns: undefined
      }
      resolve_experience: {
        Args: { raw_title: string }
        Returns: {
          experience_id: string
          is_new: boolean
          matched_title: string
        }[]
      }
      search_experiences: {
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
      toggle_follow: {
        Args: { target: string }
        Returns: {
          follower_count: number
          following: boolean
        }[]
      }
      toggle_like: {
        Args: { target: string }
        Returns: {
          like_count: number
          liked: boolean
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
