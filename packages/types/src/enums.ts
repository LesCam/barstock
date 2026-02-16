/** Matches PostgreSQL role_t */
export const Role = {
  platform_admin: "platform_admin",
  business_admin: "business_admin",
  manager: "manager",
  curator: "curator",
  staff: "staff",
  accounting: "accounting",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Matches PostgreSQL inventory_item_type_t */
export const InventoryItemType = {
  packaged_beer: "packaged_beer",
  keg_beer: "keg_beer",
  liquor: "liquor",
  wine: "wine",
  food: "food",
  misc: "misc",
} as const;
export type InventoryItemType =
  (typeof InventoryItemType)[keyof typeof InventoryItemType];

/** Matches PostgreSQL uom_t */
export const UOM = {
  units: "units",
  oz: "oz",
  ml: "ml",
  grams: "grams",
} as const;
export type UOM = (typeof UOM)[keyof typeof UOM];

/** Matches PostgreSQL source_system_t */
export const SourceSystem = {
  toast: "toast",
  square: "square",
  lightspeed: "lightspeed",
  clover: "clover",
  other: "other",
  manual: "manual",
} as const;
export type SourceSystem = (typeof SourceSystem)[keyof typeof SourceSystem];

/** Matches PostgreSQL mapping_mode_t */
export const MappingMode = {
  packaged_unit: "packaged_unit",
  draft_by_tap: "draft_by_tap",
  draft_by_product: "draft_by_product",
} as const;
export type MappingMode = (typeof MappingMode)[keyof typeof MappingMode];

/** Matches PostgreSQL keg_status_t */
export const KegStatus = {
  in_storage: "in_storage",
  in_service: "in_service",
  empty: "empty",
  returned: "returned",
} as const;
export type KegStatus = (typeof KegStatus)[keyof typeof KegStatus];

/** Matches PostgreSQL event_type_t */
export const EventType = {
  pos_sale: "pos_sale",
  tap_flow: "tap_flow",
  manual_adjustment: "manual_adjustment",
  inventory_count_adjustment: "inventory_count_adjustment",
  transfer: "transfer",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

/** Matches PostgreSQL confidence_level_t */
export const ConfidenceLevel = {
  theoretical: "theoretical",
  measured: "measured",
  estimated: "estimated",
} as const;
export type ConfidenceLevel =
  (typeof ConfidenceLevel)[keyof typeof ConfidenceLevel];

/** Matches PostgreSQL variance_reason_t */
export const VarianceReason = {
  waste_foam: "waste_foam",
  comp: "comp",
  staff_drink: "staff_drink",
  theft: "theft",
  breakage: "breakage",
  line_cleaning: "line_cleaning",
  transfer: "transfer",
  unknown: "unknown",
} as const;
export type VarianceReason =
  (typeof VarianceReason)[keyof typeof VarianceReason];

/** Matches PostgreSQL session_type_t */
export const SessionType = {
  shift: "shift",
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
} as const;
export type SessionType = (typeof SessionType)[keyof typeof SessionType];

/** Role hierarchy for RBAC */
export const ROLE_HIERARCHY: Record<Role, number> = {
  platform_admin: 6,
  business_admin: 5,
  manager: 4,
  curator: 3,
  staff: 2,
  accounting: 1,
};
