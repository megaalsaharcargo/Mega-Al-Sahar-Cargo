# ReviewGate — Authentic Review Management Platform

## Overview
ReviewGate is a full-stack platform that rewards customers with real cash for leaving authentic reviews. Businesses collect genuine reviews, customers earn money — everyone wins.

## 🌐 Live URLs
- **Landing Page**: https://3000-iblyduydr3h2kcq3v55az-a402f90a.sandbox.novita.ai/
- **Login**: https://3000-iblyduydr3h2kcq3v55az-a402f90a.sandbox.novita.ai/login.html
- **Register**: https://3000-iblyduydr3h2kcq3v55az-a402f90a.sandbox.novita.ai/register.html
- **Customer Dashboard**: https://3000-iblyduydr3h2kcq3v55az-a402f90a.sandbox.novita.ai/dashboard/customer.html
- **Business Dashboard**: https://3000-iblyduydr3h2kcq3v55az-a402f90a.sandbox.novita.ai/dashboard/business.html
- **Admin Dashboard**: https://3000-iblyduydr3h2kcq3v55az-a402f90a.sandbox.novita.ai/dashboard/admin.html

## 🔑 Demo Credentials
| Account | Email | Password |
|---------|-------|----------|
| Business | business@demo.com | demo123 |
| Customer | customer@demo.com | demo123 |
| Admin | admin@reviewgate.com | admin123 |

## ✅ Completed Features

### Customer Portal
- Sign up / Login as customer
- View personal dashboard with points balance
- See pending review invitations
- Write reviews via unique invitation links
- Earn points automatically upon review submission
- Redeem points for PayPal cash ($5/$10/$25/$50/$100)
- View full points history & transaction log
- Profile management (including PayPal email)

### Business Dashboard
- Sign up / Login as business
- Overview dashboard with stats (reviews, rating, conversion rate)
- Send single review invitations with custom points & messages
- Send bulk invitations via CSV
- View and filter all reviews by platform & rating
- Reply to customer reviews
- Real-time analytics charts (rating dist, platforms, monthly trend)
- Business profile & platform URL management
- Plan upgrade with Stripe payment integration (demo mode)

### Admin Dashboard
- Full platform overview (businesses, customers, reviews, revenue)
- Manage all businesses (activate/suspend)
- Manage all customers (activate/suspend)
- Monitor all reviews across businesses
- Process payout requests (approve with PayPal / reject)
- Manage reward tier configuration
- Add new reward tiers

### Review System
- Unique token-based invitation links
- `/review.html?token=XXX` submission page
- Auto-creates customer account if new
- Points credited instantly on submission
- Business gets notified of new reviews

## 💳 Payment Integration

### Stripe (Business Subscriptions)
- Plans: Starter (Free), Growth ($49/mo), Enterprise ($199/mo)
- Add `STRIPE_SECRET_KEY` env var to enable real payments
- Currently runs in demo mode (payments are simulated)

### PayPal (Customer Payouts)
- Customers redeem points for PayPal cash
- Add `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` for live payouts
- Admin processes payout requests from the redemptions panel
- Currently runs in demo mode

## 🗄️ Data Architecture

### Database (Cloudflare D1 SQLite)
| Table | Purpose |
|-------|---------|
| businesses | Business accounts |
| customers | Customer accounts |
| sessions | Auth tokens |
| invitations | Review invites with unique tokens |
| reviews | Submitted reviews |
| point_transactions | Points history |
| reward_tiers | Configurable reward levels |
| redemptions | Payout requests |
| payments | Stripe payment records |
| admin_users | Admin accounts |

## 🏗️ Tech Stack
- **Backend**: Hono (TypeScript) on Cloudflare Workers
- **Frontend**: Pure HTML/CSS with Tailwind CSS (CDN)
- **Database**: Cloudflare D1 (SQLite)
- **Charts**: Chart.js
- **Icons**: Font Awesome
- **Payments**: Stripe API + PayPal REST API

## 🚀 API Endpoints

### Auth
- `POST /api/auth/register` — Register business/customer
- `POST /api/auth/login` — Login with type (business/customer/admin)
- `GET /api/auth/me` — Get current user
- `POST /api/auth/logout` — Logout

### Business
- `GET /api/business/dashboard` — Dashboard stats
- `GET /api/business/reviews` — All reviews
- `POST /api/business/reviews/:id/respond` — Reply to review
- `GET /api/business/invitations` — All invitations
- `POST /api/business/invite` — Send single invite
- `POST /api/business/invite/bulk` — Send bulk invites
- `GET /api/business/analytics` — Analytics data
- `PUT /api/business/profile` — Update profile

### Customer
- `GET /api/customer/dashboard` — Dashboard data
- `GET /api/customer/points` — Points & history
- `GET /api/customer/reviews` — Written reviews
- `GET /api/customer/invitations` — Received invitations
- `POST /api/customer/redeem` — Redeem reward
- `PUT /api/customer/profile` — Update profile

### Review
- `GET /api/review/:token` — Load invitation data
- `POST /api/review/:token/submit` — Submit review

### Admin
- `GET /api/admin/overview` — Platform stats
- `GET /api/admin/businesses` — All businesses
- `GET /api/admin/customers` — All customers
- `GET /api/admin/reviews` — All reviews
- `GET /api/admin/redemptions` — All payout requests
- `POST /api/admin/redemptions/:id/process` — Process payout
- `PATCH /api/admin/businesses/:id/status` — Activate/suspend
- `PATCH /api/admin/customers/:id/status` — Activate/suspend
- `GET /api/admin/reward-tiers` — All tiers
- `POST /api/admin/reward-tiers` — Add tier

### Payments
- `POST /api/payments/create-intent` — Create Stripe payment
- `POST /api/payments/confirm` — Confirm & upgrade plan
- `POST /api/payments/paypal/payout` — Process PayPal payout

## 🔧 Environment Variables (Optional)
```
STRIPE_SECRET_KEY=sk_live_...     # Stripe for business subscriptions
PAYPAL_CLIENT_ID=...              # PayPal for customer payouts
PAYPAL_CLIENT_SECRET=...          # PayPal secret
```

## Deployment
- **Platform**: Cloudflare Workers + D1
- **Status**: ✅ Active in sandbox
- **Last Updated**: 2026-03-27
