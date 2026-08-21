# Euroclean

The whole of Euroclean Cleaning Service in one deployment: the public website, the
staff operating system, and the customer portal — one door, three destinations.

| | |
|---|---|
| Live | https://euroclean.vercel.app |
| Website | `/` — static, hand-built, no framework |
| Application | `/app` — React 18 + Vite + Tailwind |
| Database | Supabase `oyuquouhjnrfzcedeltq` |
| Owner | Liftori (hosted and maintained) |

## How it fits together

`index.html` is the marketing site. It is a single hand-written file with no build
step of its own; Vite copies it through untouched. Its booking form posts to the
`book` edge function, which **re-prices the job server-side** and files a lead. The
price a visitor sees is a claim; `quote_price()` in the database is the answer.

`app.html` boots the React application. One sign-in screen serves everybody:
`AuthContext` asks the database who you are and `App.jsx` sends employees to `/app/os`
and customers to `/app/portal`. A hidden nav item is not a permission — every gated
page refuses on its own through `<Guard>`, and behind that, row-level security refuses
again in the database.

## The rules this codebase keeps

- **One price list.** `pricing_beds`, `services`, `frequencies` and `service_extras` are
  tables. Nothing hardcodes a service key or a dollar amount.
- **Ledgers, not counters.** Stock on hand is derived from `inventory_moves`; an invoice's
  paid amount is derived from `payments`. Neither can drift without a row explaining it.
- **An update that matched no row is a failure.** Writes `.select()` and check the length,
  so a silent refusal never renders as success.
- **No browser dialogs.** Destructive actions arm in place and confirm in the same button.
- **Say the real reason.** When Stripe is not configured the pay button says so and gives
  the office number, rather than failing like a declined card.

## Running it

    npm install
    npm run dev        # http://localhost:5173  and  /app.html

Environment (`.env`):

    VITE_SUPABASE_URL=https://oyuquouhjnrfzcedeltq.supabase.co
    VITE_SUPABASE_ANON_KEY=sb_publishable_...

## Edge functions

| Function | JWT | What it does |
|---|---|---|
| `book` | no | Public booking. Re-prices server-side, files the lead, notifies the office. |
| `invite-staff` | yes | Owner/manager only. Creates the login *and* the staff row together. |
| `invite-client` | yes | Office only. Opens a portal login and links it to the customer. |
| `stripe-checkout` | yes | Checkout session for one invoice, read under the caller's own RLS. |
| `stripe-webhook` | no | Signature-checked. Writes the payment; the trigger updates the invoice. |

Stripe is optional. Without `STRIPE_SECRET_KEY` the product works in full and card
payment declines to pretend.
