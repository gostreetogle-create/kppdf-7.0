#!/bin/bash
# Initialize MongoDB replica set rs0 on FIRST start.
# Per ARCHITECTURE §5: required for multi-doc transactions.
# Idempotent: if rs0 already initiated, the rs.initiate() will throw, which we swallow.

set -e

echo "[mongo-init] Initializing replica set rs0..."

mongosh --quiet --eval "
  try {
    rs.initiate({
      _id: 'rs0',
      members: [{ _id: 0, host: 'localhost:27017' }]
    });
    print('[mongo-init] ✅ Replica set rs0 initialized');
  } catch (e) {
    if (e.codeName === 'AlreadyInitialized') {
      print('[mongo-init] ℹ️ Replica set rs0 already initialized');
    } else {
      print('[mongo-init] ⚠️ Error: ' + e);
    }
  }
"
