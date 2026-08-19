# Stock Ledger — Excel-style shop inventory app

A flat, fully editable spreadsheet for tracking shoes/sandals/slippers —
add, rename, retype, or delete any column or row yourself, exactly like
Excel. The one built-in extra: mark any column as an **image** column and
tap a cell to attach a product photo from the camera or gallery.

Offline. No subscriptions. Data is stored in a real SQLite database on
your phone.

## Project structure

```
stock-ledger-app/
├── www/                        ← the actual app (what runs on your phone)
│   ├── index.html
│   ├── css/styles.css           the spreadsheet look
│   └── js/
│       ├── db.js                 backend: loads/saves the sheet to SQLite
│       ├── photo.js                camera/gallery capture
│       ├── sheet.js                 the spreadsheet engine (columns, rows, cells)
│       ├── toast.js                  small status messages
│       └── app.js                     boots everything
├── package.json                 Capacitor + SQLite + Camera dependencies
├── capacitor.config.json        tells Capacitor "www/" is the app
├── .github/workflows/build-apk.yml   builds the .apk automatically
└── .gitignore
```

## How the data model works

Everything — columns and rows — is just data, stored as one JSON document
inside a single SQLite table (`sheet_data`). There is no fixed schema like
"Name, Size, Qty" baked into the code. The starting template
(Name / Category / Size / Color / Qty / Cost / Sell / Photo) is just the
first few rows of that JSON — you can rename, retype, delete, or add to
any of it from inside the app. This is what makes it behave like an
actual Excel sheet instead of a form with fixed fields.

## Testing it before building the APK

You don't need Android set up to try the UI:

```
npm install
npx http-server www -p 8080      (or any static file server)
```

Open `http://localhost:8080` in a browser. It must be served over
http(s), not opened as a `file://` path, for the SQLite web component to
work correctly.

## Building the APK yourself on GitHub

1. Push this project to a new GitHub repository.
2. Go to the **Actions** tab — the "Build Android APK" workflow runs
   automatically on every push to `main` (or trigger it manually with
   "Run workflow").
3. When it finishes, open the completed run and download the
   **stock-ledger-debug-apk** artifact — that's your `.apk`.
4. Transfer it to your phone and install it (you'll need to allow
   "install from unknown sources" once, since it's not from the Play
   Store).

This builds a **debug** APK, which is fine for personal/single-shop use.
If you ever want to distribute it more widely, that needs a signed
release build — a different, slightly more involved step.

## Honest caveats

- I wrote this against the current `@capacitor-community/sqlite` and
  `@capacitor/camera` APIs, but I haven't been able to run the actual
  Android build in this environment — the first CI run may surface a
  version mismatch or a missing native permission that needs a small
  fix. If `assembleDebug` fails, the error message in the Actions log
  will point at what to adjust, and I can help you fix it from that log.
- Camera permission on Android is normally auto-merged into the manifest
  by the Camera plugin, but if the photo picker doesn't prompt correctly
  on first install, that's the first place to check.
- Images are stored as base64 text inside the SQLite row for simplicity.
  Fine for a few hundred–2000 items with modest photo sizes; if the app
  ever feels slow to save, the next step is switching image storage to
  the filesystem (saving a file path instead of the image itself) —
  I can do that upgrade without changing anything else.
