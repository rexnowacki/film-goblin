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
      activity_comments: {
        Row: {
          activity_id: string
          body: string
          created_at: string
          id: string
          like_count: number
          user_id: string
        }
        Insert: {
          activity_id: string
          body: string
          created_at?: string
          id?: string
          like_count?: number
          user_id: string
        }
        Update: {
          activity_id?: string
          body?: string
          created_at?: string
          id?: string
          like_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "activity_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_reactions: {
        Row: {
          activity_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reactions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity"
            referencedColumns: ["id"]
          },
        ]
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
      film_tags: {
        Row: {
          film_id: string
          tag_id: string
          created_at: string
        }
        Insert: {
          film_id: string
          tag_id: string
          created_at?: string
        }
        Update: {
          film_id?: string
          tag_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_tags_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
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
          itunes_id: number | null
          itunes_url: string
          last_checked_at: string | null
          last_priced_at: string | null
          runtime_min: number
          title: string
          tracking: boolean
          trailer_label: string | null
          trailer_source: string | null
          trailer_updated_at: string | null
          trailer_url: string | null
          trailer_verified: boolean
          trailer_youtube_id: string | null
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
          itunes_id?: number | null
          itunes_url?: string
          last_checked_at?: string | null
          last_priced_at?: string | null
          runtime_min?: number
          title: string
          tracking?: boolean
          trailer_label?: string | null
          trailer_source?: string | null
          trailer_updated_at?: string | null
          trailer_url?: string | null
          trailer_verified?: boolean
          trailer_youtube_id?: string | null
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
          itunes_id?: number | null
          itunes_url?: string
          last_checked_at?: string | null
          last_priced_at?: string | null
          runtime_min?: number
          title?: string
          tracking?: boolean
          trailer_label?: string | null
          trailer_source?: string | null
          trailer_updated_at?: string | null
          trailer_url?: string | null
          trailer_verified?: boolean
          trailer_youtube_id?: string | null
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
      library: {
        Row: {
          created_at: string
          film_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          film_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          film_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films_with_stats"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "list_films_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films_with_stats"
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
      notifications: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          payload?: Json
          read_at?: string | null
          user_id?: string
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
            foreignKeyName: "price_alerts_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films_with_stats"
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
          {
            foreignKeyName: "price_history_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string
          bio: string
          broadcast_library: boolean
          broadcast_watched: boolean
          broadcast_watchlist_adds: boolean
          created_at: string
          display_name: string
          email_added_at: string | null
          email_comments: boolean
          email_coven_invites: boolean
          email_coven_recs: boolean
          email_price_drops: boolean
          notify_comment_likes: boolean
          notify_rate_reminders: boolean
          username: string
          id: string
          onboarded_at: string | null
          role: "goblin" | "witch" | "high_goblin"
          unsubscribe_token: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string
          bio?: string
          broadcast_library?: boolean
          broadcast_watched?: boolean
          broadcast_watchlist_adds?: boolean
          created_at?: string
          display_name: string
          email_added_at?: string | null
          email_comments?: boolean
          email_coven_invites?: boolean
          email_coven_recs?: boolean
          email_price_drops?: boolean
          notify_comment_likes?: boolean
          notify_rate_reminders?: boolean
          username: string
          id: string
          onboarded_at?: string | null
          role?: "goblin" | "witch" | "high_goblin"
          unsubscribe_token?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string
          bio?: string
          broadcast_library?: boolean
          broadcast_watched?: boolean
          broadcast_watchlist_adds?: boolean
          created_at?: string
          display_name?: string
          email_added_at?: string | null
          email_comments?: boolean
          email_coven_invites?: boolean
          email_coven_recs?: boolean
          email_price_drops?: boolean
          notify_comment_likes?: boolean
          notify_rate_reminders?: boolean
          username?: string
          id?: string
          onboarded_at?: string | null
          role?: "goblin" | "witch" | "high_goblin"
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
          {
            foreignKeyName: "recommendations_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films_with_stats"
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
          {
            foreignKeyName: "reviews_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films_with_stats"
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
      tags: {
        Row: {
          id: string
          name: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          type: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          created_at?: string
        }
        Relationships: []
      }
      watched: {
        Row: {
          created_at: string
          film_id: string
          id: string
          note: string | null
          recommended: boolean | null
          user_id: string
          watched_at: string
        }
        Insert: {
          created_at?: string
          film_id: string
          id?: string
          note?: string | null
          recommended?: boolean | null
          user_id: string
          watched_at?: string
        }
        Update: {
          created_at?: string
          film_id?: string
          id?: string
          note?: string | null
          recommended?: boolean | null
          user_id?: string
          watched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watched_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watched_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films_with_stats"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "watchlists_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      films_with_stats: {
        Row: {
          artwork_url: string | null
          available: boolean | null
          content_advisory: string | null
          coven_rating_count: number | null
          coven_rating_pct: number | null
          description: string | null
          director: string | null
          first_seen_at: string | null
          genre_primary: string | null
          id: string | null
          itunes_id: number | null
          itunes_url: string | null
          last_checked_at: string | null
          last_priced_at: string | null
          latest_price: number | null
          owned_count: number | null
          runtime_min: number | null
          title: string | null
          tracking: boolean | null
          watcher_count: number | null
          watchlist_count: number | null
          year: number | null
        }
        Insert: {
          artwork_url?: string | null
          available?: boolean | null
          content_advisory?: string | null
          description?: string | null
          director?: string | null
          first_seen_at?: string | null
          genre_primary?: string | null
          id?: string | null
          itunes_id?: number | null
          itunes_url?: string | null
          last_checked_at?: string | null
          last_priced_at?: string | null
          latest_price?: never
          owned_count?: never
          runtime_min?: number | null
          title?: string | null
          tracking?: boolean | null
          watcher_count?: never
          watchlist_count?: never
          year?: number | null
        }
        Update: {
          artwork_url?: string | null
          available?: boolean | null
          content_advisory?: string | null
          description?: string | null
          director?: string | null
          first_seen_at?: string | null
          genre_primary?: string | null
          id?: string | null
          itunes_id?: number | null
          itunes_url?: string | null
          last_checked_at?: string | null
          last_priced_at?: string | null
          latest_price?: never
          owned_count?: never
          runtime_min?: number | null
          title?: string | null
          tracking?: boolean | null
          watcher_count?: never
          watchlist_count?: never
          year?: number | null
        }
        Relationships: []
      }
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
        | "watch_logged"
        | "library_added"
      coven_request_status: "pending" | "accepted" | "declined"
      notification_kind:
        | "coven_invite_pending"
        | "coven_invite_accepted"
        | "recommendation_received"
        | "price_drop"
        | "comment_on_activity"
        | "like_on_comment"
        | "rate_reminder"
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
        "watch_logged",
        "library_added",
      ],
      coven_request_status: ["pending", "accepted", "declined"],
      review_status: ["draft", "published"],
      staff_role: ["reviewer", "admin"],
    },
  },
} as const

