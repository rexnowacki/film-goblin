export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _migrations: {
        Row: {
          applied_at: string
          name: string
        }
        Insert: {
          applied_at?: string
          name: string
        }
        Update: {
          applied_at?: string
          name?: string
        }
        Relationships: []
      }
      activity: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          payload: Json
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["activity_kind"]
          payload?: Json
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          payload?: Json
        }
        Relationships: []
      }
      coven_members: {
        Row: {
          created_at: string
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          created_at?: string
          user_a_id: string
          user_b_id: string
        }
        Update: {
          created_at?: string
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: []
      }
      coven_requests: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["coven_request_status"]
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["coven_request_status"]
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["coven_request_status"]
          to_user_id?: string
        }
        Relationships: []
      }
      films: {
        Row: {
          artwork_url: string
          available: boolean
          content_advisory: string
          description: string
          director: string
          first_seen_at: string
          genre_primary: string
          id: string
          itunes_id: number
          itunes_url: string
          last_checked_at: string | null
          last_priced_at: string | null
          runtime_min: number
          title: string
          tracking: boolean
          year: number
        }
        Insert: {
          artwork_url?: string
          available?: boolean
          content_advisory?: string
          description?: string
          director?: string
          first_seen_at?: string
          genre_primary?: string
          id?: string
          itunes_id: number
          itunes_url?: string
          last_checked_at?: string | null
          last_priced_at?: string | null
          runtime_min?: number
          title: string
          tracking?: boolean
          year?: number
        }
        Update: {
          artwork_url?: string
          available?: boolean
          content_advisory?: string
          description?: string
          director?: string
          first_seen_at?: string
          genre_primary?: string
          id?: string
          itunes_id?: number
          itunes_url?: string
          last_checked_at?: string | null
          last_priced_at?: string | null
          runtime_min?: number
          title?: string
          tracking?: boolean
          year?: number
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followed_user_id: string
          follower_user_id: string
        }
        Insert: {
          created_at?: string
          followed_user_id: string
          follower_user_id: string
        }
        Update: {
          created_at?: string
          followed_user_id?: string
          follower_user_id?: string
        }
        Relationships: []
      }
      list_films: {
        Row: {
          added_at: string
          film_id: string
          list_id: string
          position: number
        }
        Insert: {
          added_at?: string
          film_id: string
          list_id: string
          position: number
        }
        Update: {
          added_at?: string
          film_id?: string
          list_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "list_films_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_films_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      list_subscriptions: {
        Row: {
          created_at: string
          list_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          list_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_subscriptions_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          description: string
          id: string
          is_official: boolean
          is_public: boolean
          owner_user_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_official?: boolean
          is_public?: boolean
          owner_user_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_official?: boolean
          is_public?: boolean
          owner_user_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          created_at: string
          film_id: string
          id: string
          new_price_usd: number
          notified_at: string | null
          old_price_usd: number
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          film_id: string
          id?: string
          new_price_usd: number
          notified_at?: string | null
          old_price_usd: number
          watchlist_id: string
        }
        Update: {
          created_at?: string
          film_id?: string
          id?: string
          new_price_usd?: number
          notified_at?: string | null
          old_price_usd?: number
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          captured_at: string
          film_id: string
          hd_price_usd: number | null
          id: string
          is_sale: boolean
          price_usd: number
        }
        Insert: {
          captured_at?: string
          film_id: string
          hd_price_usd?: number | null
          id?: string
          is_sale?: boolean
          price_usd: number
        }
        Update: {
          captured_at?: string
          film_id?: string
          hd_price_usd?: number | null
          id?: string
          is_sale?: boolean
          price_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string
          bio: string
          broadcast_watchlist_adds: boolean
          created_at: string
          display_name: string
          email_notifications_enabled: boolean
          handle: string
          id: string
          unsubscribe_token: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string
          bio?: string
          broadcast_watchlist_adds?: boolean
          created_at?: string
          display_name: string
          email_notifications_enabled?: boolean
          handle: string
          id: string
          unsubscribe_token?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string
          bio?: string
          broadcast_watchlist_adds?: boolean
          created_at?: string
          display_name?: string
          email_notifications_enabled?: boolean
          handle?: string
          id?: string
          unsubscribe_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          created_at: string
          film_id: string
          from_user_id: string
          id: string
          note: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          film_id: string
          from_user_id: string
          id?: string
          note?: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          film_id?: string
          from_user_id?: string
          id?: string
          note?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          film_id: string
          id: string
          published_at: string | null
          pullquote: string
          status: Database["public"]["Enums"]["review_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          film_id: string
          id?: string
          published_at?: string | null
          pullquote?: string
          status?: Database["public"]["Enums"]["review_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          film_id?: string
          id?: string
          published_at?: string | null
          pullquote?: string
          status?: Database["public"]["Enums"]["review_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          created_at: string
          film_id: string
          id: string
          last_alerted_at: string | null
          max_price_usd: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          film_id: string
          id?: string
          last_alerted_at?: string | null
          max_price_usd?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          film_id?: string
          id?: string
          last_alerted_at?: string | null
          max_price_usd?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_kind:
        | "review_published"
        | "recommendation_sent"
        | "watchlist_added"
        | "list_created"
        | "list_film_added"
        | "coven_joined"
      coven_request_status: "pending" | "accepted" | "declined"
      review_status: "draft" | "published"
      staff_role: "reviewer" | "admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_kind: [
        "review_published",
        "recommendation_sent",
        "watchlist_added",
        "list_created",
        "list_film_added",
        "coven_joined",
      ],
      coven_request_status: ["pending", "accepted", "declined"],
      review_status: ["draft", "published"],
      staff_role: ["reviewer", "admin"],
    },
  },
} as const

