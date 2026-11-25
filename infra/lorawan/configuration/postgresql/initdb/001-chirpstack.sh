#!/bin/bash
# Creates the ChirpStack role and database on first start. UNTESTED.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  create role chirpstack with login password '$CHIRPSTACK_POSTGRES_PASSWORD';
  create database chirpstack with owner chirpstack;
EOSQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname chirpstack <<-EOSQL
  create extension if not exists pg_trgm;
EOSQL
