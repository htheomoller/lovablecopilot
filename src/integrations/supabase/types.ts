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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      cp_projects: {
        Row: {
          answers: Json
          created_at: string
          id: string
          roadmap: Json | null
          state: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          roadmap?: Json | null
          state?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          roadmap?: Json | null
          state?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      dev_breadcrumbs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          owner_id: string
          scope: string
          summary: string
          tags: string[] | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          owner_id: string
          scope: string
          summary: string
          tags?: string[] | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          owner_id?: string
          scope?: string
          summary?: string
          tags?: string[] | null
        }
        Relationships: []
      }
      ledger_milestones: {
        Row: {
          created_at: string
          duration_days: number | null
          id: string
          name: string
          owner_id: string
          project: string
          start_date: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          duration_days?: number | null
          id: string
          name: string
          owner_id: string
          project: string
          start_date?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          duration_days?: number | null
          id?: string
          name?: string
          owner_id?: string
          project?: string
          start_date?: string | null
          status?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          connected_repositories: Json | null
          created_at: string
          email: string
          github_access_token: string | null
          github_username: string | null
          id: string
          last_github_sync: string | null
          name: string | null
          website: string | null
        }
        Insert: {
          connected_repositories?: Json | null
          created_at?: string
          email: string
          github_access_token?: string | null
          github_username?: string | null
          id: string
          last_github_sync?: string | null
          name?: string | null
          website?: string | null
        }
        Update: {
          connected_repositories?: Json | null
          created_at?: string
          email?: string
          github_access_token?: string | null
          github_username?: string | null
          id?: string
          last_github_sync?: string | null
          name?: string | null
          website?: string | null
        }
        Relationships: []
      }
      project_guidelines: {
        Row: {
          created_at: string | null
          id: string
          k: string
          updated_at: string | null
          user_id: string
          v: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          k: string
          updated_at?: string | null
          user_id: string
          v: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          k?: string
          updated_at?: string | null
          user_id?: string
          v?: Json
        }
        Relationships: []
      }
      repository_audits: {
        Row: {
          audit_results: Json | null
          audit_status: string | null
          created_at: string
          id: string
          last_audit_date: string | null
          repository_name: string
          repository_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audit_results?: Json | null
          audit_status?: string | null
          created_at?: string
          id?: string
          last_audit_date?: string | null
          repository_name: string
          repository_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audit_results?: Json | null
          audit_status?: string | null
          created_at?: string
          id?: string
          last_audit_date?: string | null
          repository_name?: string
          repository_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repository_audits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_sample_milestones: {
        Args: { user_id: string }
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
