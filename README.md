# Cafe POS — iPad register

Expo (React Native) app for the iPad register. Works offline: orders are saved on the iPad, printed over the LAN, and synced to the backend when the internet returns.

## How offline works

1. Every order is written to a local SQLite outbox first, with an id generated on the iPad.
2. If the server answers, the order is created through `PUT /api/v1/orders/pos/{id}` and gets its normal `POS-###` code.
3. If the server can't be reached, the order gets an `OFF-<iPad letter><nn>` code, prints straight away, and syncs later with its original time, cashier, prices and payments.
4. Retrying is safe: the server returns the existing order when the same id is sent twice.
5. Receipts are always built on the iPad (`src/lib/printing`, a port of the backend `EscPosDocument`) and sent as raw ESC/POS to `printer-ip:9100`.

Offline you can create orders, take payment, and reprint. Opening and closing shifts, cash movements, cancelling, refunds, stock changes and online orders need the internet. A shift can't be closed while orders are still waiting to sync.

## Screens

- **Register:** tap an item to add it with its default options. Hold the item, or tap it in the cart, to change options.
- **Live:** website and Talabat orders, refreshed every 5 seconds. New orders ring until someone accepts them, and accepting prints the kitchen ticket. Orders then move from preparing to ready to paid, using the channel's payment methods.
- **Orders:** today's orders on this iPad with their sync status, or a search of all orders by code or phone. Open an order to refund, cancel or reprint it.
- **Stock:** mark menu items and options as sold out or back in stock.
- **Shift:** open the shift, record cash drops and payouts, and close with a printed report. Managers also see the last 7 days of shifts.
- **Settings (managers):** server address, iPad letter and printer.

## Developing on Windows

```sh
npm install
npx expo start --web     # quick UI preview in a desktop browser (printing is logged, not sent)
npx tsc --noEmit         # typecheck
npx eslint src           # lint
```

Expo Go can't be used because the printer socket is a native module. Use a development build on a real iPad instead.

## Building for iPad (no Mac needed)

You need a paid Apple Developer account. Everything below runs on Windows through EAS:

```sh
npx eas-cli@latest login
npx eas-cli@latest init                       # links the project and sets the project id
npx eas-cli@latest update:configure           # enables over-the-air updates
npx eas-cli@latest device:create              # register each iPad (open the link on the iPad)
npx eas-cli@latest build -p ios --profile development   # dev build for testing on registered iPads
npx eas-cli@latest build -p ios --profile preview       # internal build for the cafe iPads
```

EAS creates and stores the Apple signing certificates. Install the build from the link EAS prints.

## Shipping fixes immediately

JavaScript changes don't need a new build:

```sh
npx eas-cli@latest update --channel preview --message "Fix receipt layout"
```

The iPads download the update on next launch. A new build is only needed when native modules or `app.json` native settings change.

## First-time setup on each iPad

1. Open the app. On the setup screen, enter the server address and give the iPad a unique letter (A, B, …).
2. Enter the printer's IP address. Give the printer a fixed IP on the router first. The port is usually 9100.
3. Tap **Print test page**.
4. Allow **Local Network** access when iOS asks. Without it, printing fails.
5. Each staff member signs in once while online. After that, they can also sign in offline on this iPad.
6. Turn on Guided Access to keep the iPad locked to the app.
