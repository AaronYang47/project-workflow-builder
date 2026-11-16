interface Env {
  CMS_SYNC_TOKEN?: string;
  CMS_PROJECT_OWNER_USER_ID?: string;
  R2_BUCKET?: R2Bucket;
  /** Permanent activity record, shared with the audit console site. */
  AUDIT_DB?: D1Database;
}
