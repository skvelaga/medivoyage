# Medivoyage scripts

## `export_leads.py`

Dumps the Firestore `leads` collection (waitlist submissions from the landing page) to a timestamped Excel workbook.

### First-time setup

```bash
pip install firebase-admin openpyxl
```

Authenticate with Google Cloud one of two ways:

**Option A — `gcloud` (easiest if you already have the SDK):**

```bash
gcloud auth application-default login
```

**Option B — service-account key file:**

1. Firebase Console → Project settings → Service accounts → Generate new private key
2. Save the JSON somewhere outside the repo (it contains secrets)
3. Export the path:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
   ```

The Admin SDK bypasses Firestore security rules, so even though public clients can't read `leads`, your script can.

### Run

```bash
cd medivoyage
python scripts/export_leads.py
# → leads_20260424_143012.xlsx
```

Or a custom path:

```bash
python scripts/export_leads.py -o ~/Desktop/april-waitlist.xlsx
```

The output has columns: submitted timestamp (UTC), name, email, phone, source (Hero/Final), page, referrer, user agent, doc ID.

### Enabling Firestore (one-time, for the project)

If this is your first time using Firestore on `medivoy-1ff3b`:

1. Firebase Console → **Firestore Database** → **Create database**
2. **Start in production mode** (security rules in `firestore.rules` are stricter than the test-mode default)
3. Pick a location close to you (e.g. `us-central1`) — this is permanent
4. Click **Enable**

Then deploy the rules from the repo root:

```bash
firebase deploy --only firestore:rules
```
