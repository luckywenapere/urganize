-- URG-178: generic key/value config store, first use is pricing_page_mode
-- ('free' | 'paid') so the marketing pricing page can flip display modes
-- without a redeploy.
CREATE TABLE IF NOT EXISTS "AppConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);
