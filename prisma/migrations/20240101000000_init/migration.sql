-- CreateEnum
CREATE TYPE "Level" AS ENUM ('L3', 'L4', 'L5', 'L6', 'SDE_I', 'SDE_II', 'SDE_III', 'STAFF', 'PRINCIPAL', 'IC4', 'IC5');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('INR', 'USD', 'GBP', 'EUR');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('CONTRIBUTOR', 'SCRAPED', 'AI_INFERRED');

-- CreateTable
CREATE TABLE "Company" (
    "id"               TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "slug"             TEXT NOT NULL,
    "normalized_name"  TEXT NOT NULL,
    "industry"         TEXT,
    "headquarters"     TEXT,
    "founded_year"     INTEGER,
    "headcount_range"  TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salary" (
    "id"                   TEXT NOT NULL,
    "company_id"           TEXT NOT NULL,
    "role"                 TEXT NOT NULL,
    "level"                "Level" NOT NULL,
    "location"             TEXT NOT NULL,
    "currency"             "Currency" NOT NULL,
    "experience_years"     INTEGER NOT NULL,
    "base_salary"          BIGINT NOT NULL,
    "bonus"                BIGINT NOT NULL DEFAULT 0,
    "stock"                BIGINT NOT NULL DEFAULT 0,
    "total_compensation"   BIGINT NOT NULL,
    "source"               "Source" NOT NULL,
    "confidence_score"     DECIMAL(4,3) NOT NULL,
    "is_verified"          BOOLEAN NOT NULL DEFAULT false,
    "submitted_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Salary_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Salary_experience_years_check" CHECK ("experience_years" > 0 AND "experience_years" < 51),
    CONSTRAINT "Salary_confidence_score_check" CHECK ("confidence_score" >= 0.0 AND "confidence_score" <= 1.0),
    CONSTRAINT "Salary_base_salary_check" CHECK ("base_salary" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_normalized_name_idx" ON "Company"("normalized_name");

CREATE INDEX "Company_name_idx" ON "Company"("name"); 

-- CreateIndex
CREATE INDEX "Salary_company_id_level_location_idx" ON "Salary"("company_id", "level", "location");

-- CreateIndex
CREATE INDEX "Salary_total_compensation_idx" ON "Salary"("total_compensation");

-- CreateIndex
CREATE INDEX "Salary_submitted_at_idx" ON "Salary"("submitted_at");

-- CreateIndex
CREATE INDEX "Salary_location_level_idx" ON "Salary"("location", "level");

-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
