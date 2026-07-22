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
      alert_rules: {
        Row: {
          active: boolean
          condition: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          subject_id: string | null
          subject_type: Database["public"]["Enums"]["subject_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          condition: Json
          created_at?: string
          id?: string
          name: string
          owner_id: string
          subject_id?: string | null
          subject_type: Database["public"]["Enums"]["subject_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          condition?: Json
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          subject_id?: string | null
          subject_type?: Database["public"]["Enums"]["subject_type"]
          updated_at?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          confidence: number
          detail: Json | null
          headline: string
          id: string
          owner_id: string
          rule_id: string | null
          state: Database["public"]["Enums"]["alert_state"]
          triggered_at: string
        }
        Insert: {
          confidence?: number
          detail?: Json | null
          headline: string
          id?: string
          owner_id: string
          rule_id?: string | null
          state?: Database["public"]["Enums"]["alert_state"]
          triggered_at?: string
        }
        Update: {
          confidence?: number
          detail?: Json | null
          headline?: string
          id?: string
          owner_id?: string
          rule_id?: string | null
          state?: Database["public"]["Enums"]["alert_state"]
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      alt_data_signals: {
        Row: {
          id: string
          meta: Json | null
          signal_code: string
          source_id: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          ts: string
          value: number | null
        }
        Insert: {
          id?: string
          meta?: Json | null
          signal_code: string
          source_id?: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          ts: string
          value?: number | null
        }
        Update: {
          id?: string
          meta?: Json | null
          signal_code?: string
          source_id?: string | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          ts?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alt_data_signals_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          active: boolean
          asset_class: Database["public"]["Enums"]["asset_class"]
          country_id: string | null
          created_at: string
          currency: string | null
          exchange: string | null
          id: string
          industry_id: string | null
          name: string
          symbol: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          asset_class: Database["public"]["Enums"]["asset_class"]
          country_id?: string | null
          created_at?: string
          currency?: string | null
          exchange?: string | null
          id?: string
          industry_id?: string | null
          name: string
          symbol: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          asset_class?: Database["public"]["Enums"]["asset_class"]
          country_id?: string | null
          created_at?: string
          currency?: string | null
          exchange?: string | null
          id?: string
          industry_id?: string | null
          name?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
        ]
      }
      commodities: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          unit: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          unit?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          unit?: string | null
        }
        Relationships: []
      }
      commodity_prices: {
        Row: {
          commodity_id: string
          id: string
          price: number
          source_id: string | null
          ts: string
        }
        Insert: {
          commodity_id: string
          id?: string
          price: number
          source_id?: string | null
          ts: string
        }
        Update: {
          commodity_id?: string
          id?: string
          price?: number
          source_id?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "commodity_prices_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commodity_prices_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          created_at: string
          id: string
          iso2: string
          name: string
          region: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          iso2: string
          name: string
          region?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          iso2?: string
          name?: string
          region?: string | null
        }
        Relationships: []
      }
      cron_heartbeat: {
        Row: {
          beat_at: string
          id: string
        }
        Insert: {
          beat_at?: string
          id?: string
        }
        Update: {
          beat_at?: string
          id?: string
        }
        Relationships: []
      }
      data_points: {
        Row: {
          as_of: string
          confidence: number
          id: string
          ingested_at: string
          metric_code: string
          penalties: Json
          raw: Json | null
          source_id: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          value_num: number | null
          value_text: string | null
        }
        Insert: {
          as_of: string
          confidence?: number
          id?: string
          ingested_at?: string
          metric_code: string
          penalties?: Json
          raw?: Json | null
          source_id?: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          value_num?: number | null
          value_text?: string | null
        }
        Update: {
          as_of?: string
          confidence?: number
          id?: string
          ingested_at?: string
          metric_code?: string
          penalties?: Json
          raw?: Json | null
          source_id?: string | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          value_num?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_points_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_scores: {
        Row: {
          authority: number | null
          composite: number | null
          coverage: number | null
          created_at: string
          feature_code: string | null
          freshness: number | null
          id: string
          indicator_id: string | null
          mapping: number | null
          meta: Json | null
          reconciliation: number | null
          stability: number | null
          ts: string
        }
        Insert: {
          authority?: number | null
          composite?: number | null
          coverage?: number | null
          created_at?: string
          feature_code?: string | null
          freshness?: number | null
          id?: string
          indicator_id?: string | null
          mapping?: number | null
          meta?: Json | null
          reconciliation?: number | null
          stability?: number | null
          ts: string
        }
        Update: {
          authority?: number | null
          composite?: number | null
          coverage?: number | null
          created_at?: string
          feature_code?: string | null
          freshness?: number | null
          id?: string
          indicator_id?: string | null
          mapping?: number | null
          meta?: Json | null
          reconciliation?: number | null
          stability?: number | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_scores_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicator_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          active: boolean
          api_docs_url: string | null
          base_url: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          provider_code: string | null
          tier: Database["public"]["Enums"]["source_tier"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_docs_url?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          provider_code?: string | null
          tier: Database["public"]["Enums"]["source_tier"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_docs_url?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          provider_code?: string | null
          tier?: Database["public"]["Enums"]["source_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      data_vintages: {
        Row: {
          id: string
          indicator_id: string
          payload_hash: string
          release_date: string
          retrieved_at: string
          source_ref: string | null
        }
        Insert: {
          id?: string
          indicator_id: string
          payload_hash: string
          release_date: string
          retrieved_at?: string
          source_ref?: string | null
        }
        Update: {
          id?: string
          indicator_id?: string
          payload_hash?: string
          release_date?: string
          retrieved_at?: string
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_vintages_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicator_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      earnings_events: {
        Row: {
          actual_eps: number | null
          asset_id: string
          estimate_eps: number | null
          id: string
          period_end: string | null
          scheduled_at: string
          source_id: string | null
          surprise_pct: number | null
        }
        Insert: {
          actual_eps?: number | null
          asset_id: string
          estimate_eps?: number | null
          id?: string
          period_end?: string | null
          scheduled_at: string
          source_id?: string | null
          surprise_pct?: number | null
        }
        Update: {
          actual_eps?: number | null
          asset_id?: string
          estimate_eps?: number | null
          id?: string
          period_end?: string | null
          scheduled_at?: string
          source_id?: string | null
          surprise_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "earnings_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_indicators: {
        Row: {
          category: string | null
          code: string
          country_id: string | null
          created_at: string
          frequency: string | null
          id: string
          name: string
          provider_series_code: string | null
          provider_source_id: string | null
          unit: string | null
        }
        Insert: {
          category?: string | null
          code: string
          country_id?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          name: string
          provider_series_code?: string | null
          provider_source_id?: string | null
          unit?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          country_id?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          name?: string
          provider_series_code?: string | null
          provider_source_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "economic_indicators_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economic_indicators_provider_source_id_fkey"
            columns: ["provider_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_releases: {
        Row: {
          actual: number | null
          consensus: number | null
          id: string
          indicator_id: string
          period_ref: string | null
          previous: number | null
          release_time: string
          source_id: string | null
          surprise: number | null
        }
        Insert: {
          actual?: number | null
          consensus?: number | null
          id?: string
          indicator_id: string
          period_ref?: string | null
          previous?: number | null
          release_time: string
          source_id?: string | null
          surprise?: number | null
        }
        Update: {
          actual?: number | null
          consensus?: number | null
          id?: string
          indicator_id?: string
          period_ref?: string | null
          previous?: number | null
          release_time?: string
          source_id?: string | null
          surprise?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "economic_releases_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "economic_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economic_releases_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      event_definitions: {
        Row: {
          category: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          rules: Json | null
          version: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          rules?: Json | null
          version?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          rules?: Json | null
          version?: string
        }
        Relationships: []
      }
      event_impacts: {
        Row: {
          created_at: string
          event_id: string
          id: string
          note: string | null
          return_pct: number
          scope_code: string
          scope_type: string
          window_days: number
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          note?: string | null
          return_pct: number
          scope_code: string
          scope_type: string
          window_days?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          note?: string | null
          return_pct?: number
          scope_code?: string
          scope_type?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_impacts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "historical_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_instances: {
        Row: {
          created_at: string
          definition_id: string
          event_date: string
          id: string
          meta: Json | null
          region_id: string | null
          subject_id: string | null
          subject_type: string | null
        }
        Insert: {
          created_at?: string
          definition_id: string
          event_date: string
          id?: string
          meta?: Json | null
          region_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
        }
        Update: {
          created_at?: string
          definition_id?: string
          event_date?: string
          id?: string
          meta?: Json | null
          region_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_instances_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "event_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_instances_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_study_results: {
        Row: {
          calc_version: string
          computed_at: string
          confidence: number
          distribution: Json | null
          event_type: string
          hit_rate: number | null
          id: string
          mean_return: number | null
          median_return: number | null
          sample_size: number
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          window_days: number
        }
        Insert: {
          calc_version: string
          computed_at?: string
          confidence?: number
          distribution?: Json | null
          event_type: string
          hit_rate?: number | null
          id?: string
          mean_return?: number | null
          median_return?: number | null
          sample_size: number
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          window_days: number
        }
        Update: {
          calc_version?: string
          computed_at?: string
          confidence?: number
          distribution?: Json | null
          event_type?: string
          hit_rate?: number | null
          id?: string
          mean_return?: number | null
          median_return?: number | null
          sample_size?: number
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          window_days?: number
        }
        Relationships: []
      }
      factor_models: {
        Row: {
          approved: boolean
          created_at: string
          engine: string
          explained_variance: Json | null
          id: string
          label: string | null
          loadings: Json | null
          model_version: string
          region_id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          engine: string
          explained_variance?: Json | null
          id?: string
          label?: string | null
          loadings?: Json | null
          model_version: string
          region_id: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          engine?: string
          explained_variance?: Json | null
          id?: string
          label?: string | null
          loadings?: Json | null
          model_version?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factor_models_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      factors: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      fundamentals_annual: {
        Row: {
          asset_id: string
          currency: string | null
          fiscal_year: number
          id: string
          line_item: string
          source_id: string | null
          statement_type: string
          value: number | null
        }
        Insert: {
          asset_id: string
          currency?: string | null
          fiscal_year: number
          id?: string
          line_item: string
          source_id?: string | null
          statement_type: string
          value?: number | null
        }
        Update: {
          asset_id?: string
          currency?: string | null
          fiscal_year?: number
          id?: string
          line_item?: string
          source_id?: string | null
          statement_type?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fundamentals_annual_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamentals_annual_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fundamentals_quarterly: {
        Row: {
          asset_id: string
          currency: string | null
          id: string
          line_item: string
          period_end: string
          source_id: string | null
          statement_type: string
          value: number | null
        }
        Insert: {
          asset_id: string
          currency?: string | null
          id?: string
          line_item: string
          period_end: string
          source_id?: string | null
          statement_type: string
          value?: number | null
        }
        Update: {
          asset_id?: string
          currency?: string | null
          id?: string
          line_item?: string
          period_end?: string
          source_id?: string | null
          statement_type?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fundamentals_quarterly_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamentals_quarterly_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          base_ccy: string
          id: string
          quote_ccy: string
          rate: number
          source_id: string | null
          ts: string
        }
        Insert: {
          base_ccy: string
          id?: string
          quote_ccy: string
          rate: number
          source_id?: string | null
          ts: string
        }
        Update: {
          base_ccy?: string
          id?: string
          quote_ccy?: string
          rate?: number
          source_id?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_events: {
        Row: {
          category: string
          causes: string | null
          citations: Json
          code: string
          created_at: string
          end_date: string | null
          fingerprint: Json
          id: string
          key_takeaway: string | null
          mechanism: string | null
          name: string
          narrative_attempts: number
          narrative_confidence: number | null
          narrative_issues: Json
          narrative_status: string
          narrative_verified_at: string | null
          narrative_verifier: string | null
          source_url: string | null
          start_date: string
          summary: string
          tags: string[]
          what_happened_next: string | null
        }
        Insert: {
          category: string
          causes?: string | null
          citations?: Json
          code: string
          created_at?: string
          end_date?: string | null
          fingerprint?: Json
          id?: string
          key_takeaway?: string | null
          mechanism?: string | null
          name: string
          narrative_attempts?: number
          narrative_confidence?: number | null
          narrative_issues?: Json
          narrative_status?: string
          narrative_verified_at?: string | null
          narrative_verifier?: string | null
          source_url?: string | null
          start_date: string
          summary: string
          tags?: string[]
          what_happened_next?: string | null
        }
        Update: {
          category?: string
          causes?: string | null
          citations?: Json
          code?: string
          created_at?: string
          end_date?: string | null
          fingerprint?: Json
          id?: string
          key_takeaway?: string | null
          mechanism?: string | null
          name?: string
          narrative_attempts?: number
          narrative_confidence?: number | null
          narrative_issues?: Json
          narrative_status?: string
          narrative_verified_at?: string | null
          narrative_verifier?: string | null
          source_url?: string | null
          start_date?: string
          summary?: string
          tags?: string[]
          what_happened_next?: string | null
        }
        Relationships: []
      }
      indicator_registry: {
        Row: {
          concept_code: string
          created_at: string
          description: string | null
          direction: string | null
          engine: string
          fallback_source_id: string | null
          frequency: string
          id: string
          is_active: boolean
          license_status: string
          region_id: string
          release_calendar_id: string | null
          seasonal_adj: boolean
          series_code_native: string
          source_id: string | null
          transform_default: string | null
          unit: string | null
          updated_at: string
          vintage_policy: string
        }
        Insert: {
          concept_code: string
          created_at?: string
          description?: string | null
          direction?: string | null
          engine: string
          fallback_source_id?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          license_status?: string
          region_id: string
          release_calendar_id?: string | null
          seasonal_adj?: boolean
          series_code_native: string
          source_id?: string | null
          transform_default?: string | null
          unit?: string | null
          updated_at?: string
          vintage_policy?: string
        }
        Update: {
          concept_code?: string
          created_at?: string
          description?: string | null
          direction?: string | null
          engine?: string
          fallback_source_id?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          license_status?: string
          region_id?: string
          release_calendar_id?: string | null
          seasonal_adj?: boolean
          series_code_native?: string
          source_id?: string | null
          transform_default?: string | null
          unit?: string | null
          updated_at?: string
          vintage_policy?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicator_registry_fallback_source_id_fkey"
            columns: ["fallback_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_registry_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_registry_release_calendar_id_fkey"
            columns: ["release_calendar_id"]
            isOneToOne: false
            referencedRelation: "release_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_registry_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industries_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          data_category: Database["public"]["Enums"]["data_category"]
          details: Json | null
          error: string | null
          finished_at: string | null
          id: string
          rows_ingested: number
          source_id: string
          started_at: string
          status: Database["public"]["Enums"]["ingestion_status"]
        }
        Insert: {
          data_category: Database["public"]["Enums"]["data_category"]
          details?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          rows_ingested?: number
          source_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["ingestion_status"]
        }
        Update: {
          data_category?: Database["public"]["Enums"]["data_category"]
          details?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          rows_ingested?: number
          source_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["ingestion_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      model_outputs: {
        Row: {
          created_at: string
          id: string
          indicator_id: string | null
          meta: Json | null
          model_key: string
          model_version: string
          output_type: string
          run_id: string | null
          ts: string
          uncertainty: number | null
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_id?: string | null
          meta?: Json | null
          model_key: string
          model_version: string
          output_type: string
          run_id?: string | null
          ts: string
          uncertainty?: number | null
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          indicator_id?: string | null
          meta?: Json | null
          model_key?: string
          model_version?: string
          output_type?: string
          run_id?: string | null
          ts?: string
          uncertainty?: number | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "model_outputs_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicator_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      model_runs: {
        Row: {
          created_at: string
          diagnostics: Json | null
          error: string | null
          finished_at: string | null
          git_sha: string | null
          id: string
          input_hash: string | null
          model_key: string
          model_version: string
          output_summary: Json | null
          region_id: string | null
          service_version: string | null
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          diagnostics?: Json | null
          error?: string | null
          finished_at?: string | null
          git_sha?: string | null
          id?: string
          input_hash?: string | null
          model_key: string
          model_version: string
          output_summary?: Json | null
          region_id?: string | null
          service_version?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          diagnostics?: Json | null
          error?: string | null
          finished_at?: string | null
          git_sha?: string | null
          id?: string
          input_hash?: string | null
          model_key?: string
          model_version?: string
          output_summary?: Json | null
          region_id?: string | null
          service_version?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_runs_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items: {
        Row: {
          headline: string
          id: string
          published_at: string
          raw: Json | null
          sentiment: number | null
          source_id: string | null
          subject_id: string | null
          subject_type: Database["public"]["Enums"]["subject_type"] | null
          url: string | null
        }
        Insert: {
          headline: string
          id?: string
          published_at: string
          raw?: Json | null
          sentiment?: number | null
          source_id?: string | null
          subject_id?: string | null
          subject_type?: Database["public"]["Enums"]["subject_type"] | null
          url?: string | null
        }
        Update: {
          headline?: string
          id?: string
          published_at?: string
          raw?: Json | null
          sentiment?: number | null
          source_id?: string | null
          subject_id?: string | null
          subject_type?: Database["public"]["Enums"]["subject_type"] | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      prices_daily: {
        Row: {
          adj_close: number | null
          asset_id: string
          close: number | null
          high: number | null
          id: string
          low: number | null
          open: number | null
          source_id: string | null
          trade_date: string
          volume: number | null
        }
        Insert: {
          adj_close?: number | null
          asset_id: string
          close?: number | null
          high?: number | null
          id?: string
          low?: number | null
          open?: number | null
          source_id?: string | null
          trade_date: string
          volume?: number | null
        }
        Update: {
          adj_close?: number | null
          asset_id?: string
          close?: number | null
          high?: number | null
          id?: string
          low?: number | null
          open?: number | null
          source_id?: string | null
          trade_date?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_daily_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_daily_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      prices_intraday: {
        Row: {
          asset_id: string
          id: string
          price: number
          source_id: string | null
          ts: string
          volume: number | null
        }
        Insert: {
          asset_id: string
          id?: string
          price: number
          source_id?: string | null
          ts: string
          volume?: number | null
        }
        Update: {
          asset_id?: string
          id?: string
          price?: number
          source_id?: string | null
          ts?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_intraday_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_intraday_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_quotas: {
        Row: {
          calls_made: number
          created_at: string
          daily_limit: number
          disabled_until: string | null
          id: string
          last_call_at: string | null
          last_error: string | null
          last_status: string | null
          provider_code: string
          quota_date: string
          updated_at: string
        }
        Insert: {
          calls_made?: number
          created_at?: string
          daily_limit: number
          disabled_until?: string | null
          id?: string
          last_call_at?: string | null
          last_error?: string | null
          last_status?: string | null
          provider_code: string
          quota_date?: string
          updated_at?: string
        }
        Update: {
          calls_made?: number
          created_at?: string
          daily_limit?: number
          disabled_until?: string | null
          id?: string
          last_call_at?: string | null
          last_error?: string | null
          last_status?: string | null
          provider_code?: string
          quota_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      raw_observations: {
        Row: {
          created_at: string
          id: string
          indicator_id: string
          meta: Json | null
          observation_date: string
          release_date: string | null
          retrieved_at: string
          source_payload_ref: string | null
          unit_raw: string | null
          value_raw: number | null
          vintage_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_id: string
          meta?: Json | null
          observation_date: string
          release_date?: string | null
          retrieved_at?: string
          source_payload_ref?: string | null
          unit_raw?: string | null
          value_raw?: number | null
          vintage_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          indicator_id?: string
          meta?: Json | null
          observation_date?: string
          release_date?: string | null
          retrieved_at?: string
          source_payload_ref?: string | null
          unit_raw?: string | null
          value_raw?: number | null
          vintage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_observations_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicator_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_observations_vintage_id_fkey"
            columns: ["vintage_id"]
            isOneToOne: false
            referencedRelation: "data_vintages"
            referencedColumns: ["id"]
          },
        ]
      }
      regime_classifications: {
        Row: {
          as_of: string
          calc_version: string
          confidence: number
          id: string
          inputs: Json
          label: string
          regime_type: string
        }
        Insert: {
          as_of: string
          calc_version: string
          confidence?: number
          id?: string
          inputs?: Json
          label: string
          regime_type: string
        }
        Update: {
          as_of?: string
          calc_version?: string
          confidence?: number
          id?: string
          inputs?: Json
          label?: string
          regime_type?: string
        }
        Relationships: []
      }
      regime_states: {
        Row: {
          created_at: string
          id: string
          model_version: string
          probabilities: Json | null
          region_id: string
          state_index: number | null
          state_label: string | null
          status: string
          ts: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_version: string
          probabilities?: Json | null
          region_id: string
          state_index?: number | null
          state_label?: string | null
          status?: string
          ts: string
        }
        Update: {
          created_at?: string
          id?: string
          model_version?: string
          probabilities?: Json | null
          region_id?: string
          state_index?: number | null
          state_label?: string | null
          status?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "regime_states_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          code: string
          created_at: string
          currency_code: string | null
          id: string
          name: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_code?: string | null
          id?: string
          name: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_code?: string | null
          id?: string
          name?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      release_calendars: {
        Row: {
          cadence: string
          code: string
          created_at: string
          description: string | null
          id: string
          typical_lag_days: number | null
        }
        Insert: {
          cadence: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          typical_lag_days?: number | null
        }
        Update: {
          cadence?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          typical_lag_days?: number | null
        }
        Relationships: []
      }
      research_notes: {
        Row: {
          body: string | null
          created_at: string
          id: string
          owner_id: string
          subject_id: string | null
          subject_type: Database["public"]["Enums"]["subject_type"] | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          owner_id: string
          subject_id?: string | null
          subject_type?: Database["public"]["Enums"]["subject_type"] | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          subject_id?: string | null
          subject_type?: Database["public"]["Enums"]["subject_type"] | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      score_ledger_entries: {
        Row: {
          contribution: number | null
          created_at: string
          direction: string
          evidence_ref: Json | null
          feature_code: string
          id: string
          model_version: string
          subject_id: string
          subject_type: string
          ts: string
        }
        Insert: {
          contribution?: number | null
          created_at?: string
          direction: string
          evidence_ref?: Json | null
          feature_code: string
          id?: string
          model_version: string
          subject_id: string
          subject_type: string
          ts: string
        }
        Update: {
          contribution?: number | null
          created_at?: string
          direction?: string
          evidence_ref?: Json | null
          feature_code?: string
          id?: string
          model_version?: string
          subject_id?: string
          subject_type?: string
          ts?: string
        }
        Relationships: []
      }
      scores: {
        Row: {
          calc_version: string
          computed_at: string
          confidence: number
          deductions: Json
          id: string
          inputs: Json
          positives: Json
          score_type: string
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          value: number
          weights: Json
        }
        Insert: {
          calc_version: string
          computed_at?: string
          confidence?: number
          deductions?: Json
          id?: string
          inputs?: Json
          positives?: Json
          score_type: string
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          value: number
          weights?: Json
        }
        Update: {
          calc_version?: string
          computed_at?: string
          confidence?: number
          deductions?: Json
          id?: string
          inputs?: Json
          positives?: Json
          score_type?: string
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          value?: number
          weights?: Json
        }
        Relationships: []
      }
      sensitivity_matrix: {
        Row: {
          beta: number | null
          calc_version: string
          computed_at: string
          driver_code: string
          id: string
          r_squared: number | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          beta?: number | null
          calc_version: string
          computed_at?: string
          driver_code: string
          id?: string
          r_squared?: number | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          beta?: number | null
          calc_version?: string
          computed_at?: string
          driver_code?: string
          id?: string
          r_squared?: number | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      source_freshness_expectations: {
        Row: {
          cadence: string
          max_lag_minutes: number
          notes: string | null
          source_code: string
          updated_at: string
        }
        Insert: {
          cadence: string
          max_lag_minutes: number
          notes?: string | null
          source_code: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          max_lag_minutes?: number
          notes?: string | null
          source_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_freshness_policies: {
        Row: {
          created_at: string
          data_category: Database["public"]["Enums"]["data_category"]
          id: string
          max_age_seconds: number
          notes: string | null
          warn_age_seconds: number
        }
        Insert: {
          created_at?: string
          data_category: Database["public"]["Enums"]["data_category"]
          id?: string
          max_age_seconds: number
          notes?: string | null
          warn_age_seconds: number
        }
        Update: {
          created_at?: string
          data_category?: Database["public"]["Enums"]["data_category"]
          id?: string
          max_age_seconds?: number
          notes?: string | null
          warn_age_seconds?: number
        }
        Relationships: []
      }
      theses: {
        Row: {
          created_at: string
          hypothesis: string
          id: string
          invalidation_condition: string | null
          owner_id: string
          state: Database["public"]["Enums"]["thesis_state"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          supporting_evidence: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hypothesis: string
          id?: string
          invalidation_condition?: string | null
          owner_id: string
          state?: Database["public"]["Enums"]["thesis_state"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          supporting_evidence?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hypothesis?: string
          id?: string
          invalidation_condition?: string | null
          owner_id?: string
          state?: Database["public"]["Enums"]["thesis_state"]
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          supporting_evidence?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      thesis_evidence: {
        Row: {
          captured_at: string
          data_point_id: string | null
          direction: string
          id: string
          news_item_id: string | null
          summary: string
          thesis_id: string
          weight: number
        }
        Insert: {
          captured_at?: string
          data_point_id?: string | null
          direction: string
          id?: string
          news_item_id?: string | null
          summary: string
          thesis_id: string
          weight?: number
        }
        Update: {
          captured_at?: string
          data_point_id?: string | null
          direction?: string
          id?: string
          news_item_id?: string | null
          summary?: string
          thesis_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "thesis_evidence_data_point_id_fkey"
            columns: ["data_point_id"]
            isOneToOne: false
            referencedRelation: "data_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_evidence_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_evidence_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
      transformed_signals: {
        Row: {
          computed_at: string
          id: string
          indicator_id: string
          model_version: string
          params: Json | null
          transform_code: string
          ts: string
          value: number | null
        }
        Insert: {
          computed_at?: string
          id?: string
          indicator_id: string
          model_version: string
          params?: Json | null
          transform_code: string
          ts: string
          value?: number | null
        }
        Update: {
          computed_at?: string
          id?: string
          indicator_id?: string
          model_version?: string
          params?: Json | null
          transform_code?: string
          ts?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transformed_signals_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicator_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      undervaluation_watchlist: {
        Row: {
          added_at: string
          asset_id: string
          entry_score: number
          exit_reason: string | null
          id: string
          last_confirmed_at: string
          last_score: number
          removed_at: string | null
          weak_streak: number
        }
        Insert: {
          added_at?: string
          asset_id: string
          entry_score: number
          exit_reason?: string | null
          id?: string
          last_confirmed_at?: string
          last_score: number
          removed_at?: string | null
          weak_streak?: number
        }
        Update: {
          added_at?: string
          asset_id?: string
          entry_score?: number
          exit_reason?: string | null
          id?: string
          last_confirmed_at?: string
          last_score?: number
          removed_at?: string | null
          weak_streak?: number
        }
        Relationships: [
          {
            foreignKeyName: "undervaluation_watchlist_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_zone_overrides: {
        Row: {
          created_at: string
          id: string
          indicator_id: string
          updated_at: string
          user_id: string
          zones: Json
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_id: string
          updated_at?: string
          user_id: string
          zones: Json
        }
        Update: {
          created_at?: string
          id?: string
          indicator_id?: string
          updated_at?: string
          user_id?: string
          zones?: Json
        }
        Relationships: []
      }
      verify_check_definitions: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          id: string
          label: string
          max_age_seconds: number
          min_confidence: number
          panel_id: string
          required_series: string[]
          runner_key: string
          updated_at: string
          verifier_chain: string[]
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          id: string
          label: string
          max_age_seconds?: number
          min_confidence?: number
          panel_id: string
          required_series?: string[]
          runner_key: string
          updated_at?: string
          verifier_chain?: string[]
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          label?: string
          max_age_seconds?: number
          min_confidence?: number
          panel_id?: string
          required_series?: string[]
          runner_key?: string
          updated_at?: string
          verifier_chain?: string[]
        }
        Relationships: []
      }
      verify_runs: {
        Row: {
          calc_version: string | null
          check_id: string
          confidence: number | null
          detail: string | null
          duration_ms: number | null
          error: string | null
          evidence: Json
          finished_at: string | null
          id: string
          inputs: Json
          panel_id: string
          runner_key: string | null
          started_at: string
          status: string
          trigger_source: string | null
          verifier: string
        }
        Insert: {
          calc_version?: string | null
          check_id: string
          confidence?: number | null
          detail?: string | null
          duration_ms?: number | null
          error?: string | null
          evidence?: Json
          finished_at?: string | null
          id?: string
          inputs?: Json
          panel_id: string
          runner_key?: string | null
          started_at?: string
          status: string
          trigger_source?: string | null
          verifier: string
        }
        Update: {
          calc_version?: string | null
          check_id?: string
          confidence?: number | null
          detail?: string | null
          duration_ms?: number | null
          error?: string | null
          evidence?: Json
          finished_at?: string | null
          id?: string
          inputs?: Json
          panel_id?: string
          runner_key?: string | null
          started_at?: string
          status?: string
          trigger_source?: string | null
          verifier?: string
        }
        Relationships: [
          {
            foreignKeyName: "verify_runs_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "verify_check_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          added_at: string
          id: string
          note: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          note?: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          watchlist_id: string
        }
        Update: {
          added_at?: string
          id?: string
          note?: string | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_current_canonical_observations: {
        Row: {
          id: string | null
          indicator_id: string | null
          observation_date: string | null
          release_date: string | null
          retrieved_at: string | null
          unit_raw: string | null
          value_raw: number | null
          vintage_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_observations_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicator_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_observations_vintage_id_fkey"
            columns: ["vintage_id"]
            isOneToOne: false
            referencedRelation: "data_vintages"
            referencedColumns: ["id"]
          },
        ]
      }
      v_current_model_outputs: {
        Row: {
          id: string | null
          indicator_id: string | null
          meta: Json | null
          model_key: string | null
          model_version: string | null
          output_type: string | null
          run_id: string | null
          ts: string | null
          uncertainty: number | null
          value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "model_outputs_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicator_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      alert_state: "pending" | "triggered" | "acknowledged" | "dismissed"
      asset_class:
        | "equity"
        | "etf"
        | "bond"
        | "commodity"
        | "fx"
        | "crypto"
        | "index"
        | "future"
        | "option"
      data_category:
        | "macro_release"
        | "price_daily"
        | "price_intraday"
        | "fundamentals"
        | "earnings"
        | "news"
        | "commodity"
        | "fx"
        | "alt_data"
        | "corporate_action"
      ingestion_status: "pending" | "running" | "success" | "partial" | "failed"
      source_tier:
        | "tier1_official"
        | "tier2_regulated"
        | "tier3_reputable"
        | "tier4_alternative"
      subject_type:
        | "asset"
        | "industry"
        | "country"
        | "commodity"
        | "factor"
        | "indicator"
        | "thesis"
      thesis_state:
        | "active"
        | "strengthening"
        | "weakening"
        | "broken"
        | "archived"
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
    Enums: {
      alert_state: ["pending", "triggered", "acknowledged", "dismissed"],
      asset_class: [
        "equity",
        "etf",
        "bond",
        "commodity",
        "fx",
        "crypto",
        "index",
        "future",
        "option",
      ],
      data_category: [
        "macro_release",
        "price_daily",
        "price_intraday",
        "fundamentals",
        "earnings",
        "news",
        "commodity",
        "fx",
        "alt_data",
        "corporate_action",
      ],
      ingestion_status: ["pending", "running", "success", "partial", "failed"],
      source_tier: [
        "tier1_official",
        "tier2_regulated",
        "tier3_reputable",
        "tier4_alternative",
      ],
      subject_type: [
        "asset",
        "industry",
        "country",
        "commodity",
        "factor",
        "indicator",
        "thesis",
      ],
      thesis_state: [
        "active",
        "strengthening",
        "weakening",
        "broken",
        "archived",
      ],
    },
  },
} as const
