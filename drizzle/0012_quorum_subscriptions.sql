-- Subscriptions (Stripe). One row per user email; written only by the verified Stripe webhook.
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `email` text PRIMARY KEY NOT NULL,
  `plan` text NOT NULL,
  `status` text NOT NULL,
  `customer` text,
  `subscription` text,
  `period_end` text,
  `updated_at` text NOT NULL
);
