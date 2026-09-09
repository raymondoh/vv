export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      booking_items: {
        Row: {
          booking_id: string
          created_at: string
          event_period: unknown
          id: string
          item_ends_at: string
          item_starts_at: string
          rate_plan_id: string | null
          selection_snapshot: Json
          sort_order: number
          space_id: string
          space_layout_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          event_period?: unknown
          id?: string
          item_ends_at: string
          item_starts_at: string
          rate_plan_id?: string | null
          selection_snapshot: Json
          sort_order?: number
          space_id: string
          space_layout_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          event_period?: unknown
          id?: string
          item_ends_at?: string
          item_starts_at?: string
          rate_plan_id?: string | null
          selection_snapshot?: Json
          sort_order?: number
          space_id?: string
          space_layout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "catalog_space_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "space_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_space_layout_id_fkey"
            columns: ["space_layout_id"]
            isOneToOne: false
            referencedRelation: "space_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payment_schedule: {
        Row: {
          amount_minor: number
          booking_id: string
          created_at: string
          currency_code: string
          due_at: string | null
          due_rule_snapshot: Json
          id: string
          installment_type: string
          paid_at: string | null
          sequence: number
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          booking_id: string
          created_at?: string
          currency_code: string
          due_at?: string | null
          due_rule_snapshot?: Json
          id?: string
          installment_type: string
          paid_at?: string | null
          sequence: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          booking_id?: string
          created_at?: string
          currency_code?: string
          due_at?: string | null
          due_rule_snapshot?: Json
          id?: string
          installment_type?: string
          paid_at?: string | null
          sequence?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payment_schedule_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payment_schedule_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount_minor: number
          booking_id: string
          cancelled_at: string | null
          created_at: string
          currency_code: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          metadata: Json
          payment_kind: string
          payment_schedule_id: string | null
          payment_status: string
          provider: string
          provider_fee_minor: number | null
          provider_idempotency_key: string | null
          provider_payment_id: string | null
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          amount_minor: number
          booking_id: string
          cancelled_at?: string | null
          created_at?: string
          currency_code: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          metadata?: Json
          payment_kind: string
          payment_schedule_id?: string | null
          payment_status?: string
          provider: string
          provider_fee_minor?: number | null
          provider_idempotency_key?: string | null
          provider_payment_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          booking_id?: string
          cancelled_at?: string | null
          created_at?: string
          currency_code?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          metadata?: Json
          payment_kind?: string
          payment_schedule_id?: string | null
          payment_status?: string
          provider?: string
          provider_fee_minor?: number | null
          provider_idempotency_key?: string | null
          provider_payment_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "booking_payment_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "my_booking_payment_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_price_lines: {
        Row: {
          amount_minor: number
          booking_id: string
          booking_item_id: string | null
          calculation_snapshot: Json
          created_at: string
          currency_code: string
          description: string
          id: string
          line_type: string
          payer: string
          sequence: number
        }
        Insert: {
          amount_minor: number
          booking_id: string
          booking_item_id?: string | null
          calculation_snapshot?: Json
          created_at?: string
          currency_code: string
          description: string
          id?: string
          line_type: string
          payer: string
          sequence: number
        }
        Update: {
          amount_minor?: number
          booking_id?: string
          booking_item_id?: string | null
          calculation_snapshot?: Json
          created_at?: string
          currency_code?: string
          description?: string
          id?: string
          line_type?: string
          payer?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_price_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_lines_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_lines_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "my_booking_items"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_space_allocations: {
        Row: {
          allocation_status: string
          booking_id: string
          booking_item_id: string
          confirmed_at: string | null
          created_at: string
          expired_at: string | null
          hold_expires_at: string
          id: string
          release_reason: string | null
          released_at: string | null
          reserved_during: unknown
          reserved_from: string
          reserved_until: string
          space_id: string
        }
        Insert: {
          allocation_status?: string
          booking_id: string
          booking_item_id: string
          confirmed_at?: string | null
          created_at?: string
          expired_at?: string | null
          hold_expires_at: string
          id?: string
          release_reason?: string | null
          released_at?: string | null
          reserved_during?: unknown
          reserved_from: string
          reserved_until: string
          space_id: string
        }
        Update: {
          allocation_status?: string
          booking_id?: string
          booking_item_id?: string
          confirmed_at?: string | null
          created_at?: string
          expired_at?: string | null
          hold_expires_at?: string
          id?: string
          release_reason?: string | null
          released_at?: string | null
          reserved_during?: unknown
          reserved_from?: string
          reserved_until?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_space_allocations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_space_allocations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_space_allocations_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_space_allocations_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "my_booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_space_allocations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_by_user_id: string | null
          created_at: string
          from_status: string | null
          id: number
          metadata: Json
          reason: string | null
          to_status: string
        }
        Insert: {
          booking_id: string
          changed_by_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          metadata?: Json
          reason?: string | null
          to_status: string
        }
        Update: {
          booking_id?: string
          changed_by_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          metadata?: Json
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_transfers: {
        Row: {
          amount_minor: number
          booking_id: string
          created_at: string
          currency_code: string
          failed_at: string | null
          id: string
          metadata: Json
          organization_payment_account_id: string
          provider: string
          provider_transfer_id: string | null
          reversed_amount_minor: number
          reversed_at: string | null
          succeeded_at: string | null
          transfer_status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          booking_id: string
          created_at?: string
          currency_code: string
          failed_at?: string | null
          id?: string
          metadata?: Json
          organization_payment_account_id: string
          provider: string
          provider_transfer_id?: string | null
          reversed_amount_minor?: number
          reversed_at?: string | null
          succeeded_at?: string | null
          transfer_status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          booking_id?: string
          created_at?: string
          currency_code?: string
          failed_at?: string | null
          id?: string
          metadata?: Json
          organization_payment_account_id?: string
          provider?: string
          provider_transfer_id?: string | null
          reversed_amount_minor?: number
          reversed_at?: string | null
          succeeded_at?: string | null
          transfer_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_transfers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transfers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transfers_organization_payment_account_id_fkey"
            columns: ["organization_payment_account_id"]
            isOneToOne: false
            referencedRelation: "organization_payment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          approved_at: string | null
          booking_reference: string
          booking_request_snapshot: Json
          booking_status: string
          cancelled_at: string | null
          commercial_term_version_id: string
          commercial_terms_snapshot: Json
          commission_bps: number
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency_code: string
          customer_snapshot: Json
          customer_total_minor: number
          customer_user_id: string | null
          declined_at: string | null
          event_ends_at: string
          event_period: unknown
          event_starts_at: string
          event_type: string | null
          guest_count: number | null
          hold_expires_at: string | null
          id: string
          marketplace_commission_minor: number
          organization_id: string
          payment_status: string
          submitted_at: string
          updated_at: string
          venue_id: string
          venue_net_before_fees_minor: number
          venue_snapshot: Json
        }
        Insert: {
          approved_at?: string | null
          booking_reference: string
          booking_request_snapshot?: Json
          booking_status?: string
          cancelled_at?: string | null
          commercial_term_version_id: string
          commercial_terms_snapshot: Json
          commission_bps: number
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency_code: string
          customer_snapshot: Json
          customer_total_minor: number
          customer_user_id?: string | null
          declined_at?: string | null
          event_ends_at: string
          event_period?: unknown
          event_starts_at: string
          event_type?: string | null
          guest_count?: number | null
          hold_expires_at?: string | null
          id?: string
          marketplace_commission_minor: number
          organization_id: string
          payment_status?: string
          submitted_at?: string
          updated_at?: string
          venue_id: string
          venue_net_before_fees_minor: number
          venue_snapshot: Json
        }
        Update: {
          approved_at?: string | null
          booking_reference?: string
          booking_request_snapshot?: Json
          booking_status?: string
          cancelled_at?: string | null
          commercial_term_version_id?: string
          commercial_terms_snapshot?: Json
          commission_bps?: number
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency_code?: string
          customer_snapshot?: Json
          customer_total_minor?: number
          customer_user_id?: string | null
          declined_at?: string | null
          event_ends_at?: string
          event_period?: unknown
          event_starts_at?: string
          event_type?: string | null
          guest_count?: number | null
          hold_expires_at?: string | null
          id?: string
          marketplace_commission_minor?: number
          organization_id?: string
          payment_status?: string
          submitted_at?: string
          updated_at?: string
          venue_id?: string
          venue_net_before_fees_minor?: number
          venue_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bookings_commercial_term_version_id_fkey"
            columns: ["commercial_term_version_id"]
            isOneToOne: false
            referencedRelation: "organization_commercial_term_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_notes: {
        Row: {
          body: string
          created_at: string
          created_by_user_id: string | null
          event_plan_id: string
          id: string
          is_pinned: boolean
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by_user_id?: string | null
          event_plan_id: string
          id?: string
          is_pinned?: boolean
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by_user_id?: string | null
          event_plan_id?: string
          id?: string
          is_pinned?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_notes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_notes_event_plan_id_fkey"
            columns: ["event_plan_id"]
            isOneToOne: false
            referencedRelation: "event_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      event_plan_tasks: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string | null
          description: string | null
          due_date: string | null
          event_plan_id: string
          id: string
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          due_date?: string | null
          event_plan_id: string
          id?: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          due_date?: string | null
          event_plan_id?: string
          id?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_plan_tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_plan_tasks_event_plan_id_fkey"
            columns: ["event_plan_id"]
            isOneToOne: false
            referencedRelation: "event_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      event_plans: {
        Row: {
          archived_at: string | null
          booking_id: string
          created_at: string
          customer_user_id: string
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          booking_id: string
          created_at?: string
          customer_user_id: string
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          booking_id?: string
          created_at?: string
          customer_user_id?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_plans_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_plans_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_plans_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_tour_appointments: {
        Row: {
          appointment_status: string
          booking_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          customer_message: string | null
          customer_snapshot: Json
          customer_user_id: string | null
          id: string
          live_tour_slot_id: string
          no_show_at: string | null
          updated_at: string
        }
        Insert: {
          appointment_status?: string
          booking_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_message?: string | null
          customer_snapshot?: Json
          customer_user_id?: string | null
          id?: string
          live_tour_slot_id: string
          no_show_at?: string | null
          updated_at?: string
        }
        Update: {
          appointment_status?: string
          booking_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_message?: string | null
          customer_snapshot?: Json
          customer_user_id?: string | null
          id?: string
          live_tour_slot_id?: string
          no_show_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_tour_appointments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tour_appointments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tour_appointments_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tour_appointments_live_tour_slot_id_fkey"
            columns: ["live_tour_slot_id"]
            isOneToOne: false
            referencedRelation: "catalog_live_tour_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tour_appointments_live_tour_slot_id_fkey"
            columns: ["live_tour_slot_id"]
            isOneToOne: false
            referencedRelation: "live_tour_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      live_tour_slots: {
        Row: {
          assigned_host_user_id: string | null
          cancelled_at: string | null
          created_at: string
          created_by_user_id: string | null
          ends_at: string
          host_notes: string | null
          id: string
          slot_period: unknown
          starts_at: string
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          assigned_host_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          ends_at: string
          host_notes?: string | null
          id?: string
          slot_period?: unknown
          starts_at: string
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          assigned_host_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          ends_at?: string
          host_notes?: string | null
          id?: string
          slot_period?: unknown
          starts_at?: string
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_tour_slots_assigned_host_user_id_fkey"
            columns: ["assigned_host_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tour_slots_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tour_slots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tour_slots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          created_by_user_id: string | null
          duration_ms: number | null
          file_size_bytes: number | null
          height_px: number | null
          id: string
          media_kind: string
          mime_type: string
          organization_id: string
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          width_px: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          created_by_user_id?: string | null
          duration_ms?: number | null
          file_size_bytes?: number | null
          height_px?: number | null
          id?: string
          media_kind: string
          mime_type: string
          organization_id: string
          status?: string
          storage_bucket: string
          storage_path: string
          updated_at?: string
          width_px?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          created_by_user_id?: string | null
          duration_ms?: number | null
          file_size_bytes?: number | null
          height_px?: number | null
          id?: string
          media_kind?: string
          mime_type?: string
          organization_id?: string
          status?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_commercial_term_versions: {
        Row: {
          commission_bps: number
          created_at: string
          created_by_user_id: string | null
          deposit_bps: number
          effective_during: unknown
          effective_from: string
          effective_until: string | null
          final_balance_due_days_before_event: number
          id: string
          organization_id: string
          terms_jsonb: Json
          version_number: number
        }
        Insert: {
          commission_bps: number
          created_at?: string
          created_by_user_id?: string | null
          deposit_bps: number
          effective_during?: unknown
          effective_from: string
          effective_until?: string | null
          final_balance_due_days_before_event: number
          id?: string
          organization_id: string
          terms_jsonb?: Json
          version_number: number
        }
        Update: {
          commission_bps?: number
          created_at?: string
          created_by_user_id?: string | null
          deposit_bps?: number
          effective_during?: unknown
          effective_from?: string
          effective_until?: string | null
          final_balance_due_days_before_event?: number
          id?: string
          organization_id?: string
          terms_jsonb?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_commercial_term_versions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_commercial_term_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          joined_at: string
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          joined_at?: string
          organization_id: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          joined_at?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_payment_accounts: {
        Row: {
          account_status: string
          capabilities_snapshot: Json
          charges_enabled: boolean
          connected_at: string | null
          country_code: string | null
          created_at: string
          default_currency_code: string | null
          details_submitted: boolean
          disabled_at: string | null
          id: string
          organization_id: string
          payouts_enabled: boolean
          provider: string
          provider_account_id: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          capabilities_snapshot?: Json
          charges_enabled?: boolean
          connected_at?: string | null
          country_code?: string | null
          created_at?: string
          default_currency_code?: string | null
          details_submitted?: boolean
          disabled_at?: string | null
          id?: string
          organization_id: string
          payouts_enabled?: boolean
          provider: string
          provider_account_id?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          capabilities_snapshot?: Json
          charges_enabled?: boolean
          connected_at?: string | null
          country_code?: string | null
          created_at?: string
          default_currency_code?: string | null
          details_submitted?: boolean
          disabled_at?: string | null
          id?: string
          organization_id?: string
          payouts_enabled?: boolean
          provider?: string
          provider_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_payment_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          company_number: string | null
          contact_email: string | null
          contact_phone: string | null
          country_code: string
          created_at: string
          created_by_user_id: string | null
          display_name: string
          id: string
          legal_name: string
          slug: string
          status: string
          tax_registration_number: string | null
          updated_at: string
        }
        Insert: {
          company_number?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country_code: string
          created_at?: string
          created_by_user_id?: string | null
          display_name: string
          id?: string
          legal_name: string
          slug: string
          status?: string
          tax_registration_number?: string | null
          updated_at?: string
        }
        Update: {
          company_number?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string
          created_at?: string
          created_by_user_id?: string | null
          display_name?: string
          id?: string
          legal_name?: string
          slug?: string
          status?: string
          tax_registration_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          amount_minor: number
          booking_id: string
          booking_payment_id: string
          cancelled_at: string | null
          created_at: string
          currency_code: string
          failed_at: string | null
          id: string
          metadata: Json
          provider: string
          provider_refund_id: string | null
          reason: string | null
          refund_status: string
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          amount_minor: number
          booking_id: string
          booking_payment_id: string
          cancelled_at?: string | null
          created_at?: string
          currency_code: string
          failed_at?: string | null
          id?: string
          metadata?: Json
          provider: string
          provider_refund_id?: string | null
          reason?: string | null
          refund_status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          booking_id?: string
          booking_payment_id?: string
          cancelled_at?: string | null
          created_at?: string
          currency_code?: string
          failed_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_refund_id?: string | null
          reason?: string | null
          refund_status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "my_booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "operator_booking_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_role_assignments: {
        Row: {
          assigned_at: string
          assigned_by_user_id: string | null
          id: string
          revoked_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by_user_id?: string | null
          id?: string
          revoked_at?: string | null
          role: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by_user_id?: string | null
          id?: string
          revoked_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_role_assignments_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_overrides: {
        Row: {
          created_at: string
          id: string
          override_during: unknown
          override_from: string
          override_until: string
          rate_plan_id: string
          reason: string | null
          unit_amount_minor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          override_during?: unknown
          override_from: string
          override_until: string
          rate_plan_id: string
          reason?: string | null
          unit_amount_minor: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          override_during?: unknown
          override_from?: string
          override_until?: string
          rate_plan_id?: string
          reason?: string | null
          unit_amount_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_overrides_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "catalog_space_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_overrides_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "space_rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      space_blackouts: {
        Row: {
          blocked_during: unknown
          blocked_from: string
          blocked_until: string
          cancelled_at: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          reason: string
          space_id: string
        }
        Insert: {
          blocked_during?: unknown
          blocked_from: string
          blocked_until: string
          cancelled_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          reason: string
          space_id: string
        }
        Update: {
          blocked_during?: unknown
          blocked_from?: string
          blocked_until?: string
          cancelled_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          reason?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_blackouts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_blackouts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_booking_rules: {
        Row: {
          buffer_after_minutes: number
          buffer_before_minutes: number
          created_at: string
          maximum_advance_days: number | null
          maximum_duration_minutes: number | null
          minimum_duration_minutes: number | null
          minimum_notice_minutes: number | null
          requires_host_approval: boolean
          space_id: string
          updated_at: string
        }
        Insert: {
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          created_at?: string
          maximum_advance_days?: number | null
          maximum_duration_minutes?: number | null
          minimum_duration_minutes?: number | null
          minimum_notice_minutes?: number | null
          requires_host_approval?: boolean
          space_id: string
          updated_at?: string
        }
        Update: {
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          created_at?: string
          maximum_advance_days?: number | null
          maximum_duration_minutes?: number | null
          minimum_duration_minutes?: number | null
          minimum_notice_minutes?: number | null
          requires_host_approval?: boolean
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_booking_rules_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: true
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_layout_media_assets: {
        Row: {
          caption: string | null
          created_at: string
          media_asset_id: string
          purpose: string
          sort_order: number
          space_layout_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          media_asset_id: string
          purpose: string
          sort_order?: number
          space_layout_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          media_asset_id?: string
          purpose?: string
          sort_order?: number
          space_layout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_layout_media_assets_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_layout_media_assets_space_layout_id_fkey"
            columns: ["space_layout_id"]
            isOneToOne: false
            referencedRelation: "space_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      space_layouts: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          id: string
          layout_type: string
          name: string
          sort_order: number
          space_id: string
          status: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          layout_type: string
          name: string
          sort_order?: number
          space_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          layout_type?: string
          name?: string
          sort_order?: number
          space_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_layouts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_media_assets: {
        Row: {
          caption: string | null
          created_at: string
          media_asset_id: string
          purpose: string
          sort_order: number
          space_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          media_asset_id: string
          purpose: string
          sort_order?: number
          space_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          media_asset_id?: string
          purpose?: string
          sort_order?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_media_assets_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_media_assets_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_rate_plans: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          name: string
          pricing_model: string
          priority: number
          space_id: string
          unit_amount_minor: number
          updated_at: string
          valid_during: unknown
          valid_from: string
          valid_until: string | null
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          currency_code: string
          id?: string
          is_active?: boolean
          name: string
          pricing_model: string
          priority?: number
          space_id: string
          unit_amount_minor: number
          updated_at?: string
          valid_during?: unknown
          valid_from: string
          valid_until?: string | null
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name?: string
          pricing_model?: string
          priority?: number
          space_id?: string
          unit_amount_minor?: number
          updated_at?: string
          valid_during?: unknown
          valid_from?: string
          valid_until?: string | null
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "space_rate_plans_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          seated_capacity: number | null
          slug: string
          sort_order: number
          square_meters: number | null
          standing_capacity: number | null
          status: string
          theatre_capacity: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          seated_capacity?: number | null
          slug: string
          sort_order?: number
          square_meters?: number | null
          standing_capacity?: number | null
          status?: string
          theatre_capacity?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          seated_capacity?: number | null
          slug?: string
          sort_order?: number
          square_meters?: number | null
          standing_capacity?: number | null
          status?: string
          theatre_capacity?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaces_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_favorite_venues: {
        Row: {
          created_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorite_venues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favorite_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favorite_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          id: string
          locale: string
          phone_e164: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          phone_e164?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          phone_e164?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      venue_addresses: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          city: string
          country_code: string
          created_at: string
          latitude: number | null
          longitude: number | null
          postal_code: string | null
          region: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          city: string
          country_code: string
          created_at?: string
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          country_code?: string
          created_at?: string
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_addresses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_addresses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_blackouts: {
        Row: {
          blocked_during: unknown
          blocked_from: string
          blocked_until: string
          cancelled_at: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          reason: string
          venue_id: string
        }
        Insert: {
          blocked_during?: unknown
          blocked_from: string
          blocked_until: string
          cancelled_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          reason: string
          venue_id: string
        }
        Update: {
          blocked_during?: unknown
          blocked_from?: string
          blocked_until?: string
          cancelled_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          reason?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_blackouts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_blackouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_blackouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_media_assets: {
        Row: {
          caption: string | null
          created_at: string
          media_asset_id: string
          purpose: string
          sort_order: number
          venue_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          media_asset_id: string
          purpose: string
          sort_order?: number
          venue_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          media_asset_id?: string
          purpose?: string
          sort_order?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_media_assets_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_media_assets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_media_assets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_currency_code: string
          description: string | null
          id: string
          name: string
          organization_id: string
          published_at: string | null
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency_code: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          published_at?: string | null
          slug: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency_code?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          published_at?: string | null
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      catalog_live_tour_slots: {
        Row: {
          ends_at: string | null
          id: string | null
          starts_at: string | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_tour_slots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tour_slots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_rate_overrides: {
        Row: {
          id: string | null
          override_from: string | null
          override_until: string | null
          rate_plan_id: string | null
          unit_amount_minor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_overrides_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "catalog_space_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_overrides_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "space_rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_space_blackouts: {
        Row: {
          blocked_from: string | null
          blocked_until: string | null
          id: string | null
          space_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_blackouts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_space_booking_rules: {
        Row: {
          buffer_after_minutes: number | null
          buffer_before_minutes: number | null
          maximum_advance_days: number | null
          maximum_duration_minutes: number | null
          minimum_duration_minutes: number | null
          minimum_notice_minutes: number | null
          requires_host_approval: boolean | null
          space_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_booking_rules_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: true
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_space_rate_plans: {
        Row: {
          currency_code: string | null
          id: string | null
          name: string | null
          pricing_model: string | null
          priority: number | null
          space_id: string | null
          unit_amount_minor: number | null
          valid_from: string | null
          valid_until: string | null
          weekdays: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "space_rate_plans_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_venue_blackouts: {
        Row: {
          blocked_from: string | null
          blocked_until: string | null
          id: string | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_blackouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_blackouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_venues: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          country_code: string | null
          default_currency_code: string | null
          description: string | null
          id: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          postal_code: string | null
          published_at: string | null
          region: string | null
          slug: string | null
          timezone: string | null
        }
        Relationships: []
      }
      my_booking_items: {
        Row: {
          booking_id: string | null
          created_at: string | null
          id: string | null
          item_ends_at: string | null
          item_starts_at: string | null
          rate_plan_id: string | null
          sort_order: number | null
          space_id: string | null
          space_layout_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "catalog_space_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "space_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_space_layout_id_fkey"
            columns: ["space_layout_id"]
            isOneToOne: false
            referencedRelation: "space_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      my_booking_payment_schedule: {
        Row: {
          amount_minor: number | null
          booking_id: string | null
          created_at: string | null
          currency_code: string | null
          due_at: string | null
          id: string | null
          installment_type: string | null
          paid_at: string | null
          sequence: number | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_payment_schedule_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payment_schedule_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      my_booking_payments: {
        Row: {
          amount_minor: number | null
          booking_id: string | null
          cancelled_at: string | null
          created_at: string | null
          currency_code: string | null
          failed_at: string | null
          id: string | null
          payment_kind: string | null
          payment_schedule_id: string | null
          payment_status: string | null
          provider: string | null
          succeeded_at: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "booking_payment_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "my_booking_payment_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      my_booking_price_lines: {
        Row: {
          amount_minor: number | null
          booking_id: string | null
          booking_item_id: string | null
          created_at: string | null
          currency_code: string | null
          description: string | null
          id: string | null
          line_type: string | null
          sequence: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_price_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_lines_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_lines_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "my_booking_items"
            referencedColumns: ["id"]
          },
        ]
      }
      my_booking_status_history: {
        Row: {
          booking_id: string | null
          created_at: string | null
          from_status: string | null
          id: number | null
          to_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      my_bookings: {
        Row: {
          approved_at: string | null
          booking_reference: string | null
          booking_status: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string | null
          currency_code: string | null
          customer_total_minor: number | null
          declined_at: string | null
          event_ends_at: string | null
          event_starts_at: string | null
          event_type: string | null
          guest_count: number | null
          hold_expires_at: string | null
          id: string | null
          payment_status: string | null
          submitted_at: string | null
          updated_at: string | null
          venue_id: string | null
        }
        Insert: {
          approved_at?: string | null
          booking_reference?: string | null
          booking_status?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          currency_code?: string | null
          customer_total_minor?: number | null
          declined_at?: string | null
          event_ends_at?: string | null
          event_starts_at?: string | null
          event_type?: string | null
          guest_count?: number | null
          hold_expires_at?: string | null
          id?: string | null
          payment_status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Update: {
          approved_at?: string | null
          booking_reference?: string | null
          booking_status?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          currency_code?: string | null
          customer_total_minor?: number | null
          declined_at?: string | null
          event_ends_at?: string | null
          event_starts_at?: string | null
          event_type?: string | null
          guest_count?: number | null
          hold_expires_at?: string | null
          id?: string | null
          payment_status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "catalog_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      my_payment_refunds: {
        Row: {
          amount_minor: number | null
          booking_id: string | null
          booking_payment_id: string | null
          cancelled_at: string | null
          created_at: string | null
          currency_code: string | null
          failed_at: string | null
          id: string | null
          reason: string | null
          refund_status: string | null
          succeeded_at: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "my_booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "operator_booking_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_booking_payments: {
        Row: {
          amount_minor: number | null
          booking_id: string | null
          cancelled_at: string | null
          created_at: string | null
          currency_code: string | null
          failed_at: string | null
          id: string | null
          payment_kind: string | null
          payment_schedule_id: string | null
          payment_status: string | null
          provider: string | null
          succeeded_at: string | null
          updated_at: string | null
        }
        Insert: {
          amount_minor?: number | null
          booking_id?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency_code?: string | null
          failed_at?: string | null
          id?: string | null
          payment_kind?: string | null
          payment_schedule_id?: string | null
          payment_status?: string | null
          provider?: string | null
          succeeded_at?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_minor?: number | null
          booking_id?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency_code?: string | null
          failed_at?: string | null
          id?: string | null
          payment_kind?: string | null
          payment_schedule_id?: string | null
          payment_status?: string | null
          provider?: string | null
          succeeded_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "booking_payment_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "my_booking_payment_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_payment_refunds: {
        Row: {
          amount_minor: number | null
          booking_id: string | null
          booking_payment_id: string | null
          cancelled_at: string | null
          created_at: string | null
          currency_code: string | null
          failed_at: string | null
          id: string | null
          reason: string | null
          refund_status: string | null
          succeeded_at: string | null
          updated_at: string | null
        }
        Insert: {
          amount_minor?: number | null
          booking_id?: string | null
          booking_payment_id?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency_code?: string | null
          failed_at?: string | null
          id?: string | null
          reason?: string | null
          refund_status?: string | null
          succeeded_at?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_minor?: number | null
          booking_id?: string | null
          booking_payment_id?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency_code?: string | null
          failed_at?: string | null
          id?: string | null
          reason?: string | null
          refund_status?: string | null
          succeeded_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "my_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "my_booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_booking_payment_id_fkey"
            columns: ["booking_payment_id"]
            isOneToOne: false
            referencedRelation: "operator_booking_payments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_organization_member: {
        Args: {
          member_role_value: string
          target_organization_id: string
          target_user_id: string
        }
        Returns: {
          member_role: string
          member_status: string
          membership_id: string
          organization_id: string
          user_id: string
        }[]
      }
      approve_booking_hold: {
        Args: { target_booking_id: string }
        Returns: {
          allocations_created: number
          approved_booking_id: string
          hold_expires_at: string
          status: string
        }[]
      }
      archive_media_asset: {
        Args: { target_media_asset_id: string }
        Returns: {
          media_asset_id: string
          media_status: string
          storage_bucket: string
          storage_path: string
        }[]
      }
      archive_venue: {
        Args: { target_venue_id: string }
        Returns: {
          first_published_at: string
          venue_id: string
          venue_status: string
        }[]
      }
      cancel_booking: {
        Args: { cancellation_reason: string; target_booking_id: string }
        Returns: {
          allocations_released: number
          booking_payment_status: string
          cancelled_at: string
          cancelled_booking_id: string
          installments_cancelled: number
          status: string
        }[]
      }
      cancel_space_blackout: {
        Args: { target_blackout_id: string }
        Returns: {
          cancelled_at: string
          cancelled_blackout_id: string
        }[]
      }
      cancel_venue_blackout: {
        Args: { target_blackout_id: string }
        Returns: {
          cancelled_at: string
          cancelled_blackout_id: string
        }[]
      }
      complete_booking: {
        Args: { target_booking_id: string }
        Returns: {
          allocations_confirmed: number
          booking_payment_status: string
          booking_status: string
          completed_at: string
          completed_booking_id: string
        }[]
      }
      complete_media_asset_processing: {
        Args: {
          duration_ms_value?: number
          file_size_bytes_value?: number
          height_px_value?: number
          mime_type_value?: string
          processing_outcome_value: string
          target_media_asset_id: string
          width_px_value?: number
        }
        Returns: {
          duration_ms: number
          file_size_bytes: number
          height_px: number
          media_asset_id: string
          media_status: string
          mime_type: string
          width_px: number
        }[]
      }
      confirm_deposit_payment: {
        Args: {
          provider_fee_minor_value?: number
          provider_payment_id_value: string
          provider_succeeded_at: string
          target_payment_id: string
        }
        Returns: {
          allocations_confirmed: number
          booking_payment_status: string
          booking_status: string
          confirmed_at: string
          confirmed_booking_id: string
          deposit_payment_status: string
          deposit_schedule_status: string
        }[]
      }
      confirm_final_payment: {
        Args: {
          provider_fee_minor_value?: number
          provider_payment_id_value: string
          provider_succeeded_at: string
          target_payment_id: string
        }
        Returns: {
          booking_payment_status: string
          booking_status: string
          confirmed_booking_id: string
          final_payment_status: string
          final_schedule_status: string
          paid_at: string
          total_scheduled_paid_minor: number
        }[]
      }
      confirm_payment_refund: {
        Args: {
          provider_refund_id_value: string
          provider_succeeded_at: string
          target_refund_id: string
        }
        Returns: {
          booking_id: string
          booking_payment_status: string
          booking_refunded_total_minor: number
          confirmed_refund_id: string
          payment_refunded_total_minor: number
          payment_status: string
          refund_status: string
          succeeded_at: string
        }[]
      }
      create_organization: {
        Args: {
          company_number_value?: string
          contact_email_value?: string
          contact_phone_value?: string
          country_code_value: string
          display_name_value: string
          legal_name_value: string
          organization_id: string
          slug_value: string
          tax_registration_number_value?: string
        }
        Returns: {
          created_organization_id: string
          membership_role: string
          membership_status: string
          organization_status: string
          owner_membership_id: string
        }[]
      }
      create_organization_commercial_term_version: {
        Args: {
          commercial_term_id: string
          commission_bps_value: number
          deposit_bps_value: number
          effective_from_value: string
          final_balance_due_days_before_event_value: number
          target_organization_id: string
          terms_jsonb_value?: Json
        }
        Returns: {
          commission_bps: number
          created_commercial_term_id: string
          deposit_bps: number
          effective_from: string
          effective_until: string
          final_balance_due_days_before_event: number
          organization_id: string
          version_number: number
        }[]
      }
      create_space_blackout: {
        Args: {
          blackout_id: string
          blocked_from_value: string
          blocked_until_value: string
          reason_value: string
          target_space_id: string
        }
        Returns: {
          blocked_from: string
          blocked_until: string
          cancelled_at: string
          created_blackout_id: string
          reason: string
        }[]
      }
      create_venue_blackout: {
        Args: {
          blackout_id: string
          blocked_from_value: string
          blocked_until_value: string
          reason_value: string
          target_venue_id: string
        }
        Returns: {
          blocked_from: string
          blocked_until: string
          cancelled_at: string
          created_blackout_id: string
          reason: string
        }[]
      }
      decline_booking: {
        Args: { decline_reason: string; target_booking_id: string }
        Returns: {
          booking_payment_status: string
          declined_at: string
          declined_booking_id: string
          installments_cancelled: number
          status: string
        }[]
      }
      expire_booking_hold: {
        Args: { target_booking_id: string }
        Returns: {
          allocations_expired: number
          expired_booking_id: string
          processed_at: string
          status: string
        }[]
      }
      publish_venue: {
        Args: { target_venue_id: string }
        Returns: {
          first_published_at: string
          venue_id: string
          venue_status: string
        }[]
      }
      register_media_asset: {
        Args: {
          alt_text_value?: string
          media_asset_id: string
          media_kind_value: string
          mime_type_value: string
          storage_path_value: string
          target_organization_id: string
        }
        Returns: {
          media_kind: string
          media_status: string
          mime_type: string
          organization_id: string
          registered_media_asset_id: string
          storage_bucket: string
          storage_path: string
        }[]
      }
      request_payment_refund: {
        Args: {
          amount_minor_value: number
          reason_value: string
          refund_id: string
          target_payment_id: string
        }
        Returns: {
          amount_minor: number
          booking_id: string
          currency_code: string
          refund_status: string
          remaining_refundable_minor: number
          requested_refund_id: string
        }[]
      }
      set_organization_member_role: {
        Args: {
          new_role_value: string
          target_organization_id: string
          target_user_id: string
        }
        Returns: {
          member_role: string
          member_status: string
          membership_id: string
          organization_id: string
          user_id: string
        }[]
      }
      set_organization_member_status: {
        Args: {
          new_status_value: string
          target_organization_id: string
          target_user_id: string
        }
        Returns: {
          member_role: string
          member_status: string
          membership_id: string
          organization_id: string
          user_id: string
        }[]
      }
      submit_booking_request: {
        Args: {
          event_ends_at_value: string
          event_starts_at_value: string
          event_type_value?: string
          guest_count_value?: number
          request_details?: Json
          selected_items: Json
          submission_id: string
          target_venue_id: string
        }
        Returns: {
          booking_reference: string
          customer_total_minor: number
          deposit_amount_minor: number
          final_amount_minor: number
          final_due_at: string
          items_created: number
          status: string
          submitted_booking_id: string
        }[]
      }
      unpublish_venue: {
        Args: { target_venue_id: string }
        Returns: {
          first_published_at: string
          venue_id: string
          venue_status: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

